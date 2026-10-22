"""Prueba de extracción: ¿de qué medios podemos sacar las notas completas?

Para cada medio de datos/medios.json busca la fuente (RSS, sitemap o Google News),
toma las últimas notas, las extrae y mide qué tan completas salen. Deja un JSON y
un informe HTML en informes/ para mirar las notas tal cual van a quedar.

    .venv/bin/python motor/prueba.py                  # todos los medios
    .venv/bin/python motor/prueba.py --solo clarin,mdz
    .venv/bin/python motor/prueba.py --notas 3 --origen "GitHub Actions"
"""
import argparse
import html
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

sys.path.insert(0, str(Path(__file__).parent))
from extraer import extraer, solo_comienzo  # noqa: E402
from fuentes import descubrir, link_real  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
VIAS = {"rss": "RSS", "sitemap": "Sitemap", "google": "Google News", None: "—"}
ORIGEN = {"arc": "contenido del medio", "trafilatura": "página", "readability": "página (Readability)", "rss": "texto del RSS"}


def probar_medio(medio, n):
    via, url, items = descubrir(medio)
    res = {"id": medio["id"], "nombre": medio["nombre"], "web": medio["web"],
           "via": via, "fuente": url, "en_fuente": len(items), "notas": []}
    for item in items[:n]:
        link = link_real(item["link"])
        if not link:
            res["notas"].append({"url": item["link"], "titulo": item["titulo"],
                                 "veredicto": "falló", "motivo": "no se pudo traducir el link de Google News"})
            continue
        nota = solo_comienzo(link, item) if medio.get("a_medias") else extraer(link, item)
        nota["titulo"] = nota.get("titulo") or item["titulo"]
        res["notas"].append(nota)

    cuenta = {v: sum(1 for x in res["notas"] if x["veredicto"] == v)
              for v in ("completa", "parcial", "falló", "bloqueada")}
    completas = [x for x in res["notas"] if x["veredicto"] == "completa"]
    total = len(res["notas"]) or 1
    res.update(cuenta)
    res["palabras_prom"] = round(sum(x["palabras"] for x in completas) / len(completas)) if completas else 0
    res["con_foto"] = sum(1 for x in res["notas"] if x.get("foto"))
    res["muro"] = any(x.get("muro") for x in res["notas"])
    if not via:
        res["estado"] = "sin fuente"
    elif cuenta["completa"] / total >= 0.6:
        res["estado"] = "sirve"
    elif (cuenta["completa"] + cuenta["parcial"]) / total >= 0.6:
        res["estado"] = "parcial"
    else:
        res["estado"] = "no sirve"
    return res


# ---------- informe ----------

def e(t):
    return html.escape(str(t or ""))


def absolutas(cuerpo, base):
    cuerpo = re.sub(r'<graphic\b', "<img", cuerpo)
    cuerpo = re.sub(r'(src)="([^"]+)"', lambda m: f'{m.group(1)}="{e(urljoin(base, html.unescape(m.group(2))))}"', cuerpo)
    return cuerpo.replace("<img ", '<img loading="lazy" referrerpolicy="no-referrer" ')


ETIQUETA = {"completa": "Completa", "parcial": "Parcial", "falló": "Falló", "bloqueada": "Bloqueada",
            "sirve": "Sirve", "no sirve": "No sirve", "sin fuente": "Sin fuente"}


def sello(estado):
    clase = {"completa": "ok", "sirve": "ok", "parcial": "medio"}.get(estado, "mal")
    return f'<span class="sello {clase}">{ETIQUETA[estado]}</span>'


def lector(nota):
    foto = f'<img class="hero" src="{e(nota["foto"])}" alt="" referrerpolicy="no-referrer" loading="lazy">' if nota.get("foto") else ""
    firma = " · ".join(x for x in (nota.get("autor"), (nota.get("fecha") or "")[:10]) if x)
    return f"""
      <article class="lector">
        <h3>{e(nota["titulo"])}</h3>
        {f'<p class="bajada">{e(nota["bajada"])}</p>' if nota.get("bajada") else ""}
        {f'<p class="firma">{e(firma)}</p>' if firma else ""}
        {foto}
        <div class="cuerpo">{absolutas(nota.get("cuerpo_html", ""), nota["url_final"])}</div>
      </article>"""


def informe(resultados, origen, cuando):
    sirven = sum(1 for r in resultados if r["estado"] == "sirve")
    parciales = sum(1 for r in resultados if r["estado"] == "parcial")
    filas, secciones = [], []
    for r in resultados:
        n = len(r["notas"])
        filas.append(f"""
        <tr>
          <th scope="row"><a href="#{e(r["id"])}">{e(r["nombre"])}</a></th>
          <td>{VIAS[r["via"]]}</td>
          <td class="num">{r["completa"]}/{n}</td>
          <td class="num">{r["parcial"] or "–"}</td>
          <td class="num">{(r["falló"] + r["bloqueada"]) or "–"}</td>
          <td class="num">{r["palabras_prom"] or "–"}</td>
          <td class="num">{r["con_foto"]}/{n}</td>
          <td>{"Sí" if r["muro"] else "–"}</td>
          <td>{sello(r["estado"])}</td>
        </tr>""")
        items = []
        for x in r["notas"]:
            detalle = (f'{x["palabras"]} palabras · {ORIGEN[x["extractor"]]}' if "palabras" in x else "")
            if x.get("motivo"):
                detalle = f'{detalle} · {x["motivo"]}' if detalle else x["motivo"]
            items.append(f"""
          <li>{sello(x["veredicto"])}<a href="{e(x.get("url_final") or x["url"])}">{e(x.get("titulo"))}</a>
            <span class="detalle">{e(detalle)}</span></li>""")
        muestra = next((x for x in r["notas"] if x["veredicto"] == "completa"), None) or \
            next((x for x in r["notas"] if x["veredicto"] == "parcial"), None)
        fuente = f'<a href="{e(r["fuente"])}">{VIAS[r["via"]]}</a> · {r["en_fuente"]} notas disponibles' if r["via"] else "No se encontró RSS, sitemap ni Google News"
        secciones.append(f"""
      <section id="{e(r["id"])}" class="medio">
        <header><h2>{e(r["nombre"])}</h2>{sello(r["estado"])}</header>
        <p class="fuente">{fuente}</p>
        <ul class="notas">{"".join(items)}</ul>
        {f'<details><summary>Ver una nota como va a quedar</summary>{lector(muestra)}</details>' if muestra else ""}
      </section>""")

    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prueba de extracción</title>
<style>
  :root {{
    --papel: #f6f3ec; --tinta: #16130f; --gris: #6b655b; --linea: #d9d3c6;
    --ok: #1f6b3a; --medio: #8a5a00; --mal: #a3261b;
  }}
  @media (prefers-color-scheme: dark) {{
    :root:not([data-theme="light"]) {{
      --papel: #14120f; --tinta: #ece6da; --gris: #9a9386; --linea: #34302a;
      --ok: #6cc28a; --medio: #e0a940; --mal: #f0806f;
    }}
  }}
  :root[data-theme="dark"] {{
    --papel: #14120f; --tinta: #ece6da; --gris: #9a9386; --linea: #34302a;
    --ok: #6cc28a; --medio: #e0a940; --mal: #f0806f;
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--papel); color: var(--tinta);
    font: 17px/1.55 -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; }}
  main {{ max-width: 1080px; margin: 0 auto; padding: 48px 16px 96px; }}
  h1, h2, h3 {{ font-family: "New York", ui-serif, Georgia, serif; font-weight: 600; letter-spacing: -0.01em; }}
  h1 {{ font-size: clamp(2.4rem, 6vw, 4.2rem); line-height: 1; margin: 0 0 12px; }}
  .kicker {{ text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.78rem; color: var(--gris); margin: 0 0 8px; }}
  .resumen {{ font-size: 1.2rem; max-width: 46ch; margin: 0 0 40px; }}
  table {{ width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }}
  .tabla {{ overflow-x: auto; border-top: 3px solid var(--tinta); }}
  th, td {{ text-align: left; padding: 10px 12px 10px 0; border-bottom: 1px solid var(--linea); white-space: nowrap; }}
  thead th {{ font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gris); font-weight: 600; }}
  tbody th {{ font-weight: 600; }}
  .num {{ text-align: right; padding-right: 20px; }}
  a {{ color: inherit; text-decoration-color: var(--linea); text-underline-offset: 3px; }}
  a:hover {{ text-decoration-color: currentColor; }}
  .sello {{ display: inline-block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; padding: 2px 0; margin-right: 10px; min-width: 6.5em; }}
  .sello.ok {{ color: var(--ok); }} .sello.medio {{ color: var(--medio); }} .sello.mal {{ color: var(--mal); }}
  .medio {{ border-top: 1px solid var(--tinta); margin-top: 56px; padding-top: 16px; }}
  .medio header {{ display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }}
  .medio h2 {{ font-size: 2rem; margin: 0; }}
  .fuente {{ color: var(--gris); font-size: 0.9rem; margin: 4px 0 16px; overflow-wrap: anywhere; }}
  .notas {{ list-style: none; padding: 0; margin: 0; }}
  .notas li {{ padding: 8px 0; border-bottom: 1px solid var(--linea); }}
  .detalle {{ display: block; color: var(--gris); font-size: 0.85rem; padding-left: calc(6.5em + 10px); }}
  details {{ margin-top: 20px; }}
  summary {{ cursor: pointer; font-weight: 600; padding: 8px 0; }}
  .lector {{ max-width: 680px; margin: 16px auto 0; }}
  .lector h3 {{ font-size: clamp(1.8rem, 4vw, 2.6rem); line-height: 1.1; margin: 16px 0 12px; }}
  .bajada {{ font-size: 1.2rem; color: var(--gris); margin: 0 0 12px; }}
  .firma {{ font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--gris); }}
  .lector img {{ width: 100%; height: auto; display: block; margin: 16px 0; }}
  .cuerpo {{ font-family: "New York", ui-serif, Georgia, serif; font-size: 1.12rem; line-height: 1.65; }}
  .cuerpo h2, .cuerpo h3, .cuerpo h4 {{ font-size: 1.3rem; margin: 1.6em 0 0.4em; }}
  .cuerpo blockquote {{ margin: 1.2em 0; padding-left: 16px; border-left: 3px solid var(--tinta); }}
  @media (max-width: 640px) {{ .detalle {{ padding-left: 0; }} }}
</style>
</head>
<body>
<main>
  <p class="kicker">Prueba de extracción · {e(cuando)} · desde {e(origen)}</p>
  <h1>¿Qué medios se pueden leer completos?</h1>
  <p class="resumen">De {len(resultados)} medios, <strong>{sirven} sirven</strong> tal como están{f" y {parciales} salen a medias" if parciales else ""}. Abajo, cada nota probada y una de muestra tal cual quedaría en el diario.</p>
  <div class="tabla">
    <table>
      <thead><tr><th scope="col">Medio</th><th scope="col">Fuente</th><th scope="col" class="num">Completas</th>
        <th scope="col" class="num">Parciales</th><th scope="col" class="num">Fallaron</th>
        <th scope="col" class="num">Palabras</th><th scope="col" class="num">Con foto</th><th scope="col">Muro</th><th scope="col">Estado</th></tr></thead>
      <tbody>{"".join(filas)}</tbody>
    </table>
  </div>
  {"".join(secciones)}
</main>
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--medios", default=str(ROOT / "datos/medios.json"))
    ap.add_argument("--notas", type=int, default=5)
    ap.add_argument("--solo", default="")
    ap.add_argument("--origen", default="Mac Studio (conexión de casa)")
    ap.add_argument("--salida", default=str(ROOT / "informes"))
    args = ap.parse_args()

    medios = json.loads(Path(args.medios).read_text())
    if args.solo:
        ids = set(args.solo.split(","))
        medios = [m for m in medios if m["id"] in ids]

    with ThreadPoolExecutor(max_workers=10) as pool:
        resultados = list(pool.map(lambda m: probar_medio(m, args.notas), medios))

    orden = {"sirve": 0, "parcial": 1, "no sirve": 2, "sin fuente": 3}
    resultados.sort(key=lambda r: (orden[r["estado"]], r["nombre"]))
    cuando = datetime.now().strftime("%d/%m/%Y %H:%M")

    salida = Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)
    liviano = [{**r, "notas": [{k: v for k, v in x.items() if k != "cuerpo_html"} for x in r["notas"]]} for r in resultados]
    (salida / "prueba-extraccion.json").write_text(json.dumps(liviano, ensure_ascii=False, indent=1))
    (salida / "prueba-extraccion.html").write_text(informe(resultados, args.origen, cuando))

    for r in resultados:
        n = len(r["notas"])
        print(f'{r["nombre"]:24s} {VIAS[r["via"]]:12s} {r["completa"]}/{n} completas  '
              f'{r["parcial"]} parc.  {r["falló"] + r["bloqueada"]} mal  {r["palabras_prom"]:5d} pal.  {r["estado"]}')
    print(f"\nInforme: {salida / 'prueba-extraccion.html'}")


if __name__ == "__main__":
    main()
