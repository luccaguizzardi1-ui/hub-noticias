"""Arma la edición: las últimas notas de cada medio, extraídas tal cual, en un JSON
que la app lee: tapa y secciones (Política argentina, Internacional, ...).

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
from categorias import CATEGORIAS, clasificar  # noqa: E402
from extraer import extraer, solo_comienzo  # noqa: E402
from fuentes import descubrir, link_real  # noqa: E402
from ia import clasificar_con_ia  # noqa: E402

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
            if "categoria" not in previa:  # ediciones anteriores a las categorías
                previa["categoria"] = clasificar(previa, medio["id"], item.get("categorias", []))
            notas.append(previa)
            continue
        link = link_real(item["link"])
        if not link:
            continue
        n = solo_comienzo(link, item) if medio.get("a_medias") else extraer(link, item)
        if n["veredicto"] not in ("completa", "parcial") or not n.get("cuerpo_html"):
            continue
        nota = {
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
            "seccion": n.get("seccion") or "",
        }
        nota["categoria"] = clasificar(nota, medio["id"], item.get("categorias", []))
        notas.append(nota)
    return medio, notas


def mezclar(notas):
    """De la más nueva a la más vieja, pero sin que un medio acapare la sección:
    si las dos anteriores son del mismo medio, se adelanta la próxima de otro."""
    pendientes = sorted(notas, key=lambda n: n["publicada"], reverse=True)
    salida = []
    while pendientes:
        ultimos = {n["medio"] for n in salida[-2:]}
        i = next((k for k, n in enumerate(pendientes[:5]) if n["medio"] not in ultimos), 0)
        salida.append(pendientes.pop(i))
    return salida


def secciones_y_tapa(todas):
    # Una sección por categoría, en el orden de Lucca, con los medios mezclados.
    secciones = []
    for cat_id, nombre in CATEGORIAS:
        de_la_categoria = mezclar([n for n in todas if n["categoria"] == cat_id])
        if de_la_categoria:
            secciones.append({"id": cat_id, "nombre": nombre, "notas": [n["id"] for n in de_la_categoria]})

    # Tapa: lo más fresco y completo, con foto, de Política argentina (o de Internacional si no hay).
    tapa = []
    for sec in secciones[:2]:
        candidatas = [n for n in todas if n["id"] in sec["notas"] and n["foto"] and not n["a_medias"]]
        tapa += [n["id"] for n in sorted(candidatas, key=lambda n: n["publicada"], reverse=True)][: 3 - len(tapa)]
        if len(tapa) >= 3:
            break
    return secciones, tapa


def armar(medios, por_medio, horas, anterior=None):
    desde = (datetime.now(timezone.utc) - timedelta(hours=horas)).isoformat()
    previas = {}
    for n in (anterior or {}).get("notas", []):
        previas[n["id"]] = n
        if n.get("enlace_fuente"):
            previas[n["enlace_fuente"]] = n
    with ThreadPoolExecutor(max_workers=12) as pool:
        resultados = list(pool.map(lambda m: notas_del_medio(m, por_medio, desde, previas), medios))

    todas = [n for _, notas in resultados for n in notas]
    con_notas = {n["medio"] for n in todas}

    # Gemini revisa la sección de lo nuevo (sólo título y bajada); lo ya revisado se reusa tal cual.
    sin_revisar = [n for n in todas if not n.get("por_ia")]
    revisadas = clasificar_con_ia(sin_revisar, {m["id"]: m["nombre"] for m in medios})
    print(f"Secciones: {revisadas} de {len(sin_revisar)} notas nuevas ordenadas por Gemini, el resto por reglas")

    secciones, tapa = secciones_y_tapa(todas)

    return {
        "generada": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "medios": [{"id": m["id"], "nombre": m["nombre"], "web": m["web"], "linea": m["linea"],
                    "grupo": m.get("grupo", "aca")}
                   for m in medios if m["id"] in con_notas],
        "tapa": tapa,
        "secciones": secciones,
        "notas": todas,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--por-medio", type=int, default=10)
    ap.add_argument("--horas", type=float, default=36)
    ap.add_argument("--salida", default=str(ROOT / "app/datos/edicion.json"))
    args = ap.parse_args()

    medios = json.loads((ROOT / "datos/medios.json").read_text())
    edicion = armar(medios, args.por_medio, args.horas)  # local: siempre todo de nuevo
    salida = Path(args.salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(json.dumps(edicion, ensure_ascii=False))
    a_medias = sum(n["a_medias"] for n in edicion["notas"])
    print(f'{len(edicion["notas"])} notas de {len(edicion["medios"])} medios ({a_medias} a medias) -> {salida}')
    for sec in edicion["secciones"]:
        print(f'  {sec["nombre"]:24s} {len(sec["notas"])}')


if __name__ == "__main__":
    main()
