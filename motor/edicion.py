"""Arma la edición: las últimas notas de cada medio, extraídas tal cual, en un JSON
que la app lee (portada mixta + un cuaderno por medio).

    .venv/bin/python motor/edicion.py                 # edición completa
    .venv/bin/python motor/edicion.py --por-medio 6   # más chica, para probar

La salida (app/datos/edicion.json) lleva el texto completo de las notas: queda en
la máquina y no se sube al repositorio. En la nube se publica cifrada.
"""
import argparse
import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extraer import extraer, solo_comienzo  # noqa: E402
from fuentes import descubrir, link_real  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PALABRAS_POR_MINUTO = 220


def notas_del_medio(medio, cuantas, desde, previas):
    via, _, items = descubrir(medio)
    if not via:
        return medio, []
    recientes = [i for i in items if not i["fecha"] or i["fecha"] >= desde][:cuantas]
    notas = []
    for item in recientes:
        # Una nota que ya estaba completa en la edición anterior no se vuelve a bajar.
        previa = previas.get(hashlib.sha1(item["link"].encode()).hexdigest()[:12]) or previas.get(item["link"])
        if previa and not previa["a_medias"]:
            notas.append(previa)
            continue
        link = link_real(item["link"])
        if not link:
            continue
        n = solo_comienzo(link, item) if medio.get("a_medias") else extraer(link, item)
        if n["veredicto"] not in ("completa", "parcial") or not n.get("cuerpo_html"):
            continue
        notas.append({
            "id": hashlib.sha1(link.encode()).hexdigest()[:12],
            "medio": medio["id"],
            "titulo": n.get("titulo") or item["titulo"],
            "bajada": n.get("bajada", ""),
            "autor": n.get("autor", ""),
            "fecha": n.get("fecha") or item.get("fecha") or "",
            "publicada": item.get("fecha") or "",
            "foto": n.get("foto") or item.get("foto", ""),
            "cuerpo_html": n["cuerpo_html"],
            "url": n.get("url_final") or link,
            "enlace_fuente": item["link"],
            "minutos": max(1, round(n.get("palabras", 0) / PALABRAS_POR_MINUTO)),
            "a_medias": n["veredicto"] == "parcial",
            "motivo": n.get("motivo", ""),
        })
    return medio, notas


def armar(medios, por_medio, horas, anterior=None):
    desde = (datetime.now(timezone.utc) - timedelta(hours=horas)).isoformat()
    previas = {}
    for n in (anterior or {}).get("notas", []):
        previas[n["id"]] = n
        if n.get("enlace_fuente"):
            previas[n["enlace_fuente"]] = n
    with ThreadPoolExecutor(max_workers=11) as pool:
        resultados = list(pool.map(lambda m: notas_del_medio(m, por_medio, desde, previas), medios))

    cuadernos, todas = [], []
    for medio, notas in resultados:
        if notas:
            cuadernos.append({"medio": medio["id"], "notas": [n["id"] for n in notas]})
            todas += notas

    # Portada: la nota más fresca con foto de cada medio, de la más nueva a la más vieja;
    # las completas primero, para que la tapa nunca abra con una nota a medias.
    por_medio_ids = {c["medio"]: c["notas"] for c in cuadernos}
    por_id = {n["id"]: n for n in todas}
    portada = []
    for medio_id, ids in por_medio_ids.items():
        con_foto = [por_id[i] for i in ids if por_id[i]["foto"]]
        if con_foto:
            portada.append(con_foto[0])
    portada.sort(key=lambda n: n["publicada"], reverse=True)
    portada.sort(key=lambda n: n["a_medias"])  # estable: dentro de cada grupo sigue el orden por hora

    return {
        "generada": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "medios": [{"id": m["id"], "nombre": m["nombre"], "web": m["web"], "linea": m["linea"]}
                   for m in medios if m["id"] in por_medio_ids],
        "portada": [n["id"] for n in portada],
        "cuadernos": cuadernos,
        "notas": todas,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--por-medio", type=int, default=12)
    ap.add_argument("--horas", type=float, default=36)
    ap.add_argument("--salida", default=str(ROOT / "app/datos/edicion.json"))
    args = ap.parse_args()

    medios = json.loads((ROOT / "datos/medios.json").read_text())
    edicion = armar(medios, args.por_medio, args.horas)  # local: siempre todo de nuevo
    salida = Path(args.salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(json.dumps(edicion, ensure_ascii=False))
    a_medias = sum(n["a_medias"] for n in edicion["notas"])
    print(f'{len(edicion["notas"])} notas de {len(edicion["cuadernos"])} medios '
          f'({a_medias} a medias), portada de {len(edicion["portada"])} -> {salida}')


if __name__ == "__main__":
    main()
