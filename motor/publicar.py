"""Arma el sitio que se publica en GitHub Pages: la app más la edición cifrada.

    DIARIO_CLAVE=... .venv/bin/python motor/publicar.py --salida _site [--anterior edicion.cifrada.json]

La edición en claro nunca se escribe en el sitio. Si se pasa la edición publicada
anterior, las notas que ya estaban completas se reusan en vez de volver a bajarlas.
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from avisos import detectar  # noqa: E402
from cifrado import cifrar, descifrar  # noqa: E402
from edicion import armar  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"


def huella_app():
    """Cambia sólo cuando cambia la app: así el service worker renueva su copia cuando hace falta."""
    h = hashlib.sha1()
    for f in sorted(APP.rglob("*")):
        if f.is_file() and "datos" not in f.relative_to(APP).parts:
            h.update(str(f.relative_to(APP)).encode())
            h.update(f.read_bytes())
    return h.hexdigest()[:10]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", default=str(ROOT / "_site"))
    ap.add_argument("--anterior", default="")
    ap.add_argument("--por-medio", type=int, default=10)
    ap.add_argument("--avisos", default=str(ROOT / "avisos.json"), help="avisos de último momento para mandar después de publicar")
    args = ap.parse_args()

    frase = os.environ.get("DIARIO_CLAVE", "")
    if len(frase) < 12:
        sys.exit("Falta DIARIO_CLAVE (o es demasiado corta): sin clave no se publica nada.")

    anterior = None
    if args.anterior and Path(args.anterior).exists():
        try:
            anterior = descifrar(json.loads(Path(args.anterior).read_text()), frase)
            print(f"Edición anterior: {len(anterior['notas'])} notas para reusar")
        except Exception as e:  # clave cambiada o archivo roto: se arma todo de nuevo
            print(f"No pude leer la edición anterior ({type(e).__name__}); armo todo de nuevo")

    medios = json.loads((ROOT / "datos/medios.json").read_text())
    edicion = armar(medios, args.por_medio, 36, anterior)
    if len(edicion["notas"]) < 20:
        sys.exit(f"La edición salió con {len(edicion['notas'])} notas: no publico algo tan flaco.")

    # Último momento: lo que hay que avisar queda en un archivo aparte (nunca en el sitio) y el historial,
    # dentro de la edición cifrada, para no avisar dos veces lo mismo.
    pendientes, historial = detectar(edicion, (anterior or {}).get("avisos", []), {m["id"]: m["nombre"] for m in medios})
    if anterior is None:
        pendientes, historial = [], [a for a in historial if a not in pendientes]   # sin historial no se avisa: no repetir
    edicion["avisos"] = historial
    # La nota de un aviso se queda en la edición mientras dure el historial (48 h): tocar el aviso siempre la abre.
    avisadas = {a["nota"] for a in historial} - {n["id"] for n in edicion["notas"]}
    edicion["notas"] += [n for n in (anterior or {}).get("notas", []) if n["id"] in avisadas]
    Path(args.avisos).write_text(json.dumps(pendientes, ensure_ascii=False))
    print(f"Avisos de último momento: {len(pendientes)}" + "".join(f"\n  · {a['titulo'][:80]}" for a in pendientes))

    salida = Path(args.salida)
    if salida.exists():
        shutil.rmtree(salida)
    shutil.copytree(APP, salida, ignore=shutil.ignore_patterns("datos", ".DS_Store"))
    sobre = cifrar(edicion, frase)
    (salida / "edicion.cifrada.json").write_text(json.dumps(sobre, separators=(",", ":")))
    (salida / "version.json").write_text(json.dumps({"generada": edicion["generada"], "app": huella_app()}))
    sw = salida / "sw.js"
    if sw.exists():
        sw.write_text(sw.read_text().replace("__VERSION_APP__", huella_app()))
    (salida / ".nojekyll").write_text("")
    a_medias = sum(n["a_medias"] for n in edicion["notas"])
    print(f'Publicado: {len(edicion["notas"])} notas de {len(edicion["medios"])} medios ({a_medias} a medias), '
          f'{(salida / "edicion.cifrada.json").stat().st_size // 1024} KB cifrados')
    print("Secciones: " + ", ".join(f'{s["nombre"]} {len(s["notas"])}' for s in edicion["secciones"]))


if __name__ == "__main__":
    main()
