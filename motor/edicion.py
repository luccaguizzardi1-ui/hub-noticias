"""Arma la edición: las últimas notas de cada medio, extraídas tal cual, en un JSON
que la app lee: tapa y secciones (Política argentina, Política internacional, ...).

    .venv/bin/python motor/edicion.py                 # edición completa
    .venv/bin/python motor/edicion.py --por-medio 6   # más chica, para probar

La salida (app/datos/edicion.json) lleva el texto completo de las notas: queda en
la máquina y no se sube al repositorio. En la nube se publica cifrada.
"""
import argparse
import hashlib
import html
import json
import re
import sys
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from categorias import CATEGORIAS, clasificar  # noqa: E402
from extraer import extraer, solo_comienzo  # noqa: E402
from fuentes import descubrir, link_real  # noqa: E402
from ia import CRITERIO, agrupar_temas, clasificar_con_ia  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PALABRAS_POR_MINUTO = 220


def texto_limpio(texto, medio=None):
    """Títulos y bajadas tal cual los escribió el medio, sin restos técnicos: entidades HTML que
    llegan escapadas una o dos veces (&amp;nbsp;), espacios duros y el nombre del sitio pegado al
    final del título ("... - El Orden Mundial")."""
    texto = texto or ""
    for _ in range(3):
        nuevo = html.unescape(texto)
        if nuevo == texto:
            break
        texto = nuevo
    texto = re.sub(r"\s+", " ", texto.replace("\xa0", " ")).strip()
    if medio:
        sufijo = re.compile(rf"\s+[-|–—]\s+{re.escape(medio['nombre'])}$", re.IGNORECASE)
        texto = sufijo.sub("", texto)
    return texto


def limpiar_nota(nota, medio):
    nota["titulo"] = texto_limpio(nota.get("titulo"), medio)
    nota["bajada"] = texto_limpio(nota.get("bajada"))
    return nota


def notas_del_medio(medio, cuantas, desde, previas):
    """Las notas de un medio. Si algo falla con una nota, se saltea esa y sigue; si falla el medio
    entero, la edición sale sin él: nunca una nota rara frena toda la edición."""
    try:
        return medio, _notas_del_medio(medio, cuantas, desde, previas)
    except Exception:
        print(f"[{medio['id']}] no se pudo leer el medio; sale sin él:\n{traceback.format_exc(limit=3)}")
        return medio, []


def _notas_del_medio(medio, cuantas, desde, previas):
    via, _, items = descubrir(medio)
    if not via:
        return []
    recientes = [i for i in items if not i["fecha"] or i["fecha"] >= desde][:cuantas]
    notas = []
    for item in recientes:
        # Una nota que ya estaba completa en la edición anterior no se vuelve a bajar.
        previa = previas.get(hashlib.sha1(item["link"].encode()).hexdigest()[:12]) or previas.get(item["link"])
        if previa and not previa["a_medias"]:
            if "categoria" not in previa:  # ediciones anteriores a las categorías
                previa["categoria"] = clasificar(previa, medio["id"], item.get("categorias", []))
            notas.append(limpiar_nota(previa, medio))
            continue
        try:
            link = link_real(item["link"])
            if not link:
                continue
            n = solo_comienzo(link, item) if medio.get("a_medias") else extraer(link, item)
        except Exception as e:
            print(f"[{medio['id']}] salteo una nota ({type(e).__name__}): {item['link']}")
            continue
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
        limpiar_nota(nota, medio)
        nota["categoria"] = clasificar(nota, medio["id"], item.get("categorias", []))
        notas.append(nota)
    return notas


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


# En estas secciones lo de acá va primero: las notas de afuera (un crimen en Ohio, el clima en
# Panamá) quedan al final de la sección en vez de mezclarse con las de la Argentina.
PRIMERO_LO_DE_ACA = {"sociedad", "economia", "deportes", "cultura"}


SERVICIO = re.compile(r"^[^\w¿¡\"“'«]|en vivo|minuto a minuto|a cu[aá]nto (cotiz|cerr)|cotizaci[oó]n (de )?hoy", re.IGNORECASE)


def _fecha(n):
    try:
        return datetime.fromisoformat((n.get("publicada") or n.get("fecha") or "").replace("Z", "+00:00"))
    except ValueError:
        return datetime(2000, 1, 1, tzinfo=timezone.utc)


def secciones_y_tapa(todas, medios=(), temas=()):
    grupo = {m["id"]: m.get("grupo", "aca") for m in medios}
    # Una sección por categoría, en el orden de Lucca, con los medios mezclados.
    secciones = []
    for cat_id, nombre in CATEGORIAS:
        de_la_categoria = [n for n in todas if n["categoria"] == cat_id]
        if cat_id in PRIMERO_LO_DE_ACA and grupo:
            de_la_categoria = (mezclar([n for n in de_la_categoria if grupo.get(n["medio"]) == "aca"])
                               + mezclar([n for n in de_la_categoria if grupo.get(n["medio"]) != "aca"]))
        else:
            de_la_categoria = mezclar(de_la_categoria)
        if de_la_categoria:
            secciones.append({"id": cat_id, "nombre": nombre, "notas": [n["id"] for n in de_la_categoria]})

    destacadas = elegir_destacadas(todas, temas, grupo)
    # La tapa de antes (lista de ids) queda por compatibilidad con una app vieja guardada en el teléfono.
    tapa = [destacadas["principal"]] + [d["nota"] for d in destacadas["secciones"]][:2] if destacadas["principal"] else []
    return secciones, tapa, destacadas


def elegir_destacadas(todas, temas, grupo):
    """Lo más destacado del momento: el hecho que más medios cuentan a la vez, con desempate por
    lo más reciente. Una principal y una por sección (sin repetir el mismo hecho). De cada hecho
    se muestra la mejor versión: completa, con foto y, en Política argentina, de un medio de acá."""
    por_id = {n["id"]: n for n in todas}
    tema_de = {i: g for g in temas for i in g}
    ahora = datetime.now(timezone.utc)

    def tema(n):
        return tema_de.get(n["id"], [n["id"]])

    def puntaje(ids):
        ns = [por_id[i] for i in ids]
        horas = (ahora - max(_fecha(n) for n in ns)).total_seconds() / 3600
        frescura = 1.0 if horas <= 6 else 0.75 if horas <= 12 else 0.5 if horas <= 24 else 0.3
        completa = any(not n["a_medias"] and n["foto"] for n in ns)
        return len({n["medio"] for n in ns}) * frescura + (0.2 if completa else 0)

    def de_servicio(n):  # cotizaciones del día, minuto a minuto: no son la mejor versión de un hecho
        return bool(SERVICIO.search(n["titulo"]))

    def mejor(ns, cat):
        return max(ns, key=lambda n: (not n["a_medias"], bool(n["foto"]), not de_servicio(n),
                                      (ahora - _fecha(n)).total_seconds() < 12 * 3600,  # lo de hoy antes que lo de ayer
                                      cat == "politica" and grupo.get(n["medio"]) == "aca",
                                      n.get("minutos", 0) >= 3, _fecha(n)))  # con desarrollo antes que una cotización

    usados = set()  # hechos ya mostrados (por su primera nota)

    def candidatos(cat=None):
        vistos, salida = set(), []
        for n in todas:
            if cat and n["categoria"] != cat:
                continue
            ids = tema(n)
            if ids[0] in vistos or ids[0] in usados:
                continue
            vistos.add(ids[0])
            de_aca = [por_id[i] for i in ids if not cat or por_id[i]["categoria"] == cat]
            salida.append((puntaje(ids), mejor(de_aca, cat), ids))
        # Empate: el hecho con más notas y, después, el que se movió más recientemente.
        return sorted(salida, key=lambda x: (x[0], len(x[2]), max(_fecha(por_id[i]) for i in x[2])), reverse=True)

    # La principal sale de lo más duro (política, economía, el mundo) y con foto; si no hay, de lo que haya.
    todos = candidatos()
    duras = [x for x in todos if x[1]["categoria"] in ("politica", "internacional", "economia") and x[1]["foto"]]
    # Diario argentino: a igual cobertura, la principal es la de Política argentina.
    duras.sort(key=lambda x: x[0] + (0.5 if x[1]["categoria"] == "politica" else 0), reverse=True)
    principal = (duras or todos or [None])[0]
    salida = {"principal": None, "secciones": []}
    if principal:
        usados.add(principal[2][0])
        salida["principal"] = principal[1]["id"]
    for cat_id, _ in CATEGORIAS:
        if cat_id == "otras":
            continue
        c = candidatos(cat_id)
        if not c:
            continue
        _, nota, ids = c[0]
        usados.add(ids[0])
        salida["secciones"].append({"id": cat_id, "nota": nota["id"]})
    return salida


def armar(medios, por_medio, horas, anterior=None):
    desde = (datetime.now(timezone.utc) - timedelta(hours=horas)).isoformat()
    previas = {}
    for n in (anterior or {}).get("notas", []):
        previas[n["id"]] = n
        if n.get("enlace_fuente"):
            previas[n["enlace_fuente"]] = n
    with ThreadPoolExecutor(max_workers=12) as pool:
        resultados = list(pool.map(lambda m: notas_del_medio(m, por_medio, desde, previas), medios))

    # La misma nota puede venir de dos medios (Infobae e Infobae América comparten artículos):
    # queda una sola, la del medio que aparece primero en datos/medios.json.
    todas, vistas = [], set()
    for _, notas in resultados:
        for n in notas:
            if n["id"] not in vistas:
                vistas.add(n["id"])
                todas.append(n)
    con_notas = {n["medio"] for n in todas}

    # Gemini revisa la sección de lo nuevo (sólo título y bajada); lo ya revisado con este criterio se reusa tal cual.
    sin_revisar = [n for n in todas if n.get("por_ia") != CRITERIO]
    revisadas = clasificar_con_ia(sin_revisar, {m["id"]: m["nombre"] for m in medios})
    print(f"Secciones: {revisadas} de {len(sin_revisar)} notas sin revisar ordenadas por Gemini, el resto por reglas")

    # Gemini agrupa las notas que cuentan el mismo hecho: de ahí salen la tapa y las otras versiones.
    temas = agrupar_temas(todas, {m["id"]: m["nombre"] for m in medios})
    print(f"Temas: {len(temas)} hechos contados por más de un medio")
    secciones, tapa, destacadas = secciones_y_tapa(todas, medios, temas)

    return {
        "generada": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "medios": [{"id": m["id"], "nombre": m["nombre"], "web": m["web"], "linea": m["linea"],
                    "grupo": m.get("grupo", "aca")}
                   for m in medios if m["id"] in con_notas],
        "tapa": tapa,
        "destacadas": destacadas,
        "temas": temas,
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
