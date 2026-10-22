"""Saca una nota tal cual se publicó: título, bajada, autor, fecha, foto y cuerpo.

Nada se resume ni se reescribe. El cuerpo sale, en orden de preferencia, de:
  1. el contenido estructurado del propio medio (sitios hechos con Arc Publishing:
     Infobae, La Nación, Página/12, TN...), que es la nota exacta, párrafo por párrafo;
  2. trafilatura o Readability (el del modo lectura de Firefox) sobre la página;
  3. el cuerpo que el medio manda entero en su RSS, cuando la página no se deja leer.
Después se compara contra el largo que el medio declara en su JSON-LD para decidir
si la nota salió completa, parcial o no salió.
"""
import html
import json
import re

import trafilatura
from lxml import html as lhtml
from readability import Document

from fuentes import bajar

DESAFIO = re.compile(r"Just a moment|cf-chl|Attention Required|captcha|acceso automatizado", re.I)
MURO = re.compile(
    r"(nota|contenido) exclusiv[oa] para suscriptores|suscribite para (seguir|continuar) leyendo|"
    r"suscríbete para (seguir|continuar) leyendo|para seguir leyendo,? suscrib|si ya sos suscriptor|"
    r"exclusivo para assinantes|assine para (continuar|ler)",
    re.I,
)


RELACIONADAS = re.compile(
    r"^(mir[aá]|le[eé]|lea|ver|vea) tambi[eé]n\b|^te puede interesar|^segu[ií] leyendo|"
    r"^m[aá]s noticias|^notas relacionadas|^comentarios$|^temas:?$",
    re.I,
)
TARJETA = ("h3", "h4", "img", "figure", "a")


def palabras(texto):
    return len(re.findall(r"\w+", texto or ""))


def depurar(fragmento):
    """Saca lo que es de la página y no de la nota: bloques "Mirá también",
    tarjetas de notas relacionadas al final y el rótulo "Comentarios".
    El texto de la nota no se toca."""
    if not fragmento:
        return ""
    fragmento = re.sub(r"</?(?:html|body|head)\b[^>]*>", "", fragmento)
    div = lhtml.fromstring(f"<div>{fragmento}</div>")

    hijos = list(div)
    i = 0
    while i < len(hijos):
        el = hijos[i]
        texto = el.text_content().strip()
        if len(texto) < 40 and RELACIONADAS.search(texto):
            el.drop_tree()
            i += 1
            while i < len(hijos) and hijos[i].tag in TARJETA:
                hijos[i].drop_tree()
                i += 1
            continue
        i += 1

    # Una tira de títulos con miniatura al final es la grilla de "relacionadas".
    hijos = list(div)
    cola = []
    for el in reversed(hijos):
        if el.tag in TARJETA:
            cola.append(el)
        else:
            break
    if sum(1 for el in cola if el.tag in ("h3", "h4")) >= 2:
        for el in cola:
            el.drop_tree()

    return (div.text or "") + "".join(lhtml.tostring(c, encoding="unicode") for c in div)


def texto_de(fragmento):
    return lhtml.fromstring(f"<div>{fragmento}</div>").text_content() if fragmento else ""


def _norm(texto):
    return re.sub(r"\W+", " ", texto or "").strip().lower()


def sin_firma_del_sitio(titulo, sitio):
    """"Cómo Trump... - BBC News Mundo" -> "Cómo Trump...": el medio ya se muestra aparte."""
    m = re.match(r"(.+?)\s+[-|–—]\s+([^-|–—]{2,40})$", titulo or "")
    if m and sitio and (_norm(m.group(2)) in _norm(sitio) or _norm(sitio) in _norm(m.group(2))):
        return m.group(1)
    return titulo


def sin_encabezado(fragmento, titulo, bajada):
    """Algunos extractores arrastran al cuerpo el título, la bajada y el "Actualizado"
    de la cabecera, que ya se muestran aparte."""
    if not fragmento:
        return ""
    div = lhtml.fromstring(f"<div>{fragmento}</div>")
    repetidos = [r for r in (_norm(titulo), _norm(bajada)) if len(r) >= 15]
    for el in list(div)[:6]:
        texto = el.text_content().strip()
        t = _norm(texto)
        # El mismo texto, o el título con la volanta pegada ("Tribunales El juez da...").
        repetido = any(t == r or (r in t and len(t) <= len(r) + 40) or (len(t) >= 15 and r.startswith(t)) for r in repetidos)
        if repetido or (len(texto) < 60 and re.match(r"(atualizad|actualizad|publicad)", texto, re.I)):
            el.drop_tree()
        elif texto:
            break
    return (div.text or "") + "".join(lhtml.tostring(c, encoding="unicode") for c in div)


def _ld_articulos(doc):
    """Objetos NewsArticle/Article del JSON-LD de la página."""
    salida = []
    for s in doc.xpath('//script[@type="application/ld+json"]'):
        try:
            data = json.loads(s.text_content())
        except (ValueError, TypeError):
            continue
        pila = data if isinstance(data, list) else [data]
        while pila:
            o = pila.pop()
            if isinstance(o, list):
                pila.extend(o)
            elif isinstance(o, dict):
                if "@graph" in o:
                    pila.extend(o["@graph"] if isinstance(o["@graph"], list) else [o["@graph"]])
                tipo = o.get("@type")
                tipos = tipo if isinstance(tipo, list) else [tipo]
                if any(t and "Article" in str(t) for t in tipos):
                    salida.append(o)
    return salida


def _meta(doc, *nombres):
    for n in nombres:
        v = doc.xpath(f'//meta[@property="{n}" or @name="{n}"]/@content')
        if v and v[0].strip():
            return v[0].strip()
    return ""


def _arc(texto):
    """Nota de un sitio Arc Publishing, armada desde Fusion.globalContent."""
    marca = "Fusion.globalContent="
    i = texto.find(marca)
    if i < 0:
        return None
    try:
        data, _ = json.JSONDecoder().raw_decode(texto, i + len(marca))
    except ValueError:
        return None
    if not isinstance(data, dict) or not data.get("content_elements"):
        return None

    partes = []
    for el in data["content_elements"]:
        tipo = el.get("type")
        if tipo == "text":
            partes.append(f"<p>{el.get('content', '')}</p>")
        elif tipo == "header":
            nivel = min(max(int(el.get("level") or 2), 2), 4)
            partes.append(f"<h{nivel}>{el.get('content', '')}</h{nivel}>")
        elif tipo == "image" and el.get("url"):
            pie = html.escape(el.get("caption") or "")
            partes.append(f'<figure><img src="{html.escape(el["url"])}" alt="{pie}">'
                          f'{f"<figcaption>{pie}</figcaption>" if pie else ""}</figure>')
        elif tipo == "list":
            items = "".join(f"<li>{x.get('content', '')}</li>" for x in el.get("items", []) if x.get("type") == "text")
            partes.append(f"<{'ol' if el.get('list_type') == 'ordered' else 'ul'}>{items}</{'ol' if el.get('list_type') == 'ordered' else 'ul'}>")
        elif tipo in ("quote", "blockquote"):
            dentro = "".join(f"<p>{x.get('content', '')}</p>" for x in el.get("content_elements", []) if x.get("type") == "text")
            partes.append(f"<blockquote>{dentro}</blockquote>")
        elif tipo == "correction" and el.get("text"):
            partes.append(f"<p><em>{el['text']}</em></p>")
        # interstitial_link ("Leé también"), raw_html (embeds) y video quedan afuera por ahora.

    autores = [c.get("name") for c in (data.get("credits") or {}).get("by", []) if c.get("name")]
    foto = ((data.get("promo_items") or {}).get("basic") or {}).get("url", "")
    return {
        "titulo": ((data.get("headlines") or {}).get("basic") or "").strip(),
        "bajada": ((data.get("subheadlines") or {}).get("basic") or "").strip(),
        "autor": ", ".join(autores),
        "fecha": data.get("display_date") or data.get("first_publish_date") or "",
        "foto": foto,
        "cuerpo_html": "".join(partes),
        "restringida": ((data.get("content_restrictions") or {}).get("content_code") or "").lower(),
    }


# Sin una referencia del medio, un texto de RSS más corto que esto suele ser sólo el
# comienzo de la nota (El País manda unas 150 palabras; MDZ, la nota entera).
RSS_ENTERO = 300


def _desde_feed(nota, item, motivo):
    """La página no se deja leer: usamos el cuerpo que el medio manda en el RSS."""
    p = palabras(texto_de(item.get("contenido")))
    if p < 80:
        return None
    nota.update({
        "titulo": item.get("titulo", ""), "bajada": item.get("bajada", ""), "autor": "",
        "fecha": item.get("fecha") or "", "foto": item.get("foto", ""), "extractor": "rss",
        "palabras": p, "palabras_medio": 0, "muro": False, "cuerpo_html": item["contenido"],
        "parrafos": len(re.findall(r"<p[\s>]", item["contenido"])),
        "fotos_cuerpo": len(re.findall(r"<img\b", item["contenido"])),
        "veredicto": "completa" if p >= RSS_ENTERO else "parcial",
        "motivo": f"{motivo}; se usó el texto del RSS" if p >= RSS_ENTERO else "el RSS trae sólo el comienzo",
    })
    return nota


def extraer(url, item=None):
    item = item or {}
    r = bajar(url)
    nota = {"url": url, "url_final": r.url, "estado_http": r.estado, "error": r.error}
    texto_crudo = r.cuerpo.decode("utf-8", "ignore") if r.cuerpo else ""

    bloqueada = r.estado in (401, 403, 429, 503) or (
        texto_crudo and len(texto_crudo) < 40000 and DESAFIO.search(texto_crudo[:5000]))
    if bloqueada or not r.ok:
        motivo = "el medio bloquea la lectura automática" if bloqueada else (r.error or f"HTTP {r.estado}")
        if _desde_feed(nota, item, motivo):
            return nota
        nota["veredicto"] = "bloqueada" if bloqueada else "falló"
        nota["motivo"] = motivo
        return nota

    doc = lhtml.fromstring(r.cuerpo)
    ld = _ld_articulos(doc)
    cuerpo_ld = next((a.get("articleBody") for a in ld if a.get("articleBody")), "") or \
        next(iter(doc.xpath('//*[@itemprop="articleBody"]/@content')), "")
    muro_ld = any(str(a.get("isAccessibleForFree")).lower() in ("false", "0") for a in ld if "isAccessibleForFree" in a)
    muro = muro_ld or bool(MURO.search(texto_crudo))

    meta = trafilatura.bare_extraction(r.cuerpo, url=r.url, with_metadata=True, as_dict=True) or {}
    cuerpo_traf = trafilatura.extract(
        r.cuerpo, url=r.url, output_format="html", include_images=True,
        include_formatting=True, include_tables=True, include_comments=False, favor_recall=True,
    ) or ""
    try:
        cuerpo_read = Document(r.cuerpo).summary(html_partial=True)
    except Exception:
        cuerpo_read = ""
    arc = _arc(texto_crudo)

    candidatos = {
        "trafilatura": depurar(cuerpo_traf),
        "readability": depurar(cuerpo_read),
        "arc": arc["cuerpo_html"] if arc else "",
        "rss": item.get("contenido", ""),
    }
    largos = {k: palabras(texto_de(v)) for k, v in candidatos.items()}
    # Preferencias: el contenido estructurado del medio es la nota exacta; trafilatura
    # es más limpio que Readability, que sólo gana si trae mucho más texto.
    if largos["arc"] >= 80:
        extractor = "arc"
    elif largos["readability"] > max(1.4 * largos["trafilatura"], largos["trafilatura"] + 120):
        extractor = "readability"
    else:
        extractor = "trafilatura"
    if largos["rss"] > 1.3 * largos[extractor] and largos["rss"] >= 150:
        extractor = "rss"
    cuerpo, p, p_ld = candidatos[extractor], largos[extractor], palabras(cuerpo_ld)

    arc = arc or {}
    nota.update({
        "titulo": arc.get("titulo") or meta.get("title") or _meta(doc, "og:title"),
        "bajada": arc.get("bajada") or _meta(doc, "og:description", "description") or meta.get("description") or "",
        "autor": arc.get("autor") or meta.get("author") or "",
        "fecha": arc.get("fecha") or meta.get("date") or "",
        "foto": _meta(doc, "og:image", "twitter:image") or arc.get("foto") or meta.get("image") or "",
        "medio": meta.get("sitename") or _meta(doc, "og:site_name"),
        "extractor": extractor,
        "palabras": p,
        "palabras_por_extractor": largos,
        "palabras_medio": p_ld,
        "parrafos": len(re.findall(r"<p[\s>]", cuerpo)),
        "fotos_cuerpo": len(re.findall(r"<(?:img|graphic)\b", cuerpo)),
        "muro": muro,
    })
    nota["titulo"] = sin_firma_del_sitio(nota["titulo"], nota["medio"])
    nota["cuerpo_html"] = sin_encabezado(cuerpo, nota["titulo"], nota["bajada"])

    if p < 60:
        nota["veredicto"], nota["motivo"] = "falló", "no se encontró el cuerpo"
    elif p_ld >= 80:
        # El medio declara el largo: es la mejor referencia, con o sin muro.
        if p < 0.75 * p_ld:
            nota["veredicto"], nota["motivo"] = "parcial", f"el medio declara {p_ld} palabras y salieron {p}"
        else:
            nota["veredicto"], nota["motivo"] = "completa", ""
    elif muro and p < 300:
        nota["veredicto"], nota["motivo"] = "parcial", "muro de pago"
    else:
        nota["veredicto"], nota["motivo"] = "completa", ""
    return nota
