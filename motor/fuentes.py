"""De dónde salen las notas de cada medio: RSS, sitemap de noticias o Google News.

Se prueba en ese orden. El RSS es lo más limpio; el sitemap de noticias (el que los
medios le dan a Google) sirve cuando el RSS no existe o está bloqueado; Google News
es el último recurso porque sus links hay que traducirlos a la URL real.
"""
import gzip
import html
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0 Safari/537.36"
)
GOOGLE_NEWS = "https://news.google.com/rss/search?q=site:{dominio}+when:2d&hl=es-419&gl=AR&ceid=AR:es-419"
RUTAS_RSS = [
    "/rss/pages/home.xml",
    "/arc/outboundfeeds/rss/?outputType=xml",
    "/feed",
    "/feed/",
    "/rss",
    "/rss.xml",
    "/rss/",
]
PUBLICIDAD = re.compile(r"/(patrocinado|publicidad|sponsored|branded|contenido-patrocinado|publinota)/", re.I)
OTRAS_LISTAS = re.compile(r"tag|categor|taxonom|author|page|product", re.I)
RUTAS_SITEMAP = [
    "/sitemap-news.xml",
    "/news-sitemap.xml",
    "/sitemap_news.xml",
    "/arc/outboundfeeds/news-sitemap/?outputType=xml",
    "/sitemaps/news.xml",
]


class Respuesta:
    def __init__(self, url, estado, cuerpo, error=None):
        self.url = url
        self.estado = estado
        self.cuerpo = cuerpo or b""
        self.error = error

    @property
    def ok(self):
        return self.estado == 200 and bool(self.cuerpo)


def bajar(url, timeout=20):
    """GET que nunca levanta excepción: devuelve estado, URL final y cuerpo."""
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.6",
        "Accept-Encoding": "gzip",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
            if r.headers.get("Content-Encoding") == "gzip" or data[:2] == b"\x1f\x8b":
                data = gzip.decompress(data)
            return Respuesta(r.geturl(), r.status, data)
    except urllib.error.HTTPError as e:
        try:
            data = e.read()
        except Exception:
            data = b""
        return Respuesta(url, e.code, data, f"HTTP {e.code}")
    except Exception as e:
        return Respuesta(url, None, b"", type(e).__name__ + ": " + str(e)[:120])


def limpiar(texto):
    if not texto:
        return ""
    texto = re.sub(r"<[^>]+>", " ", texto)
    texto = html.unescape(texto)
    return re.sub(r"\s+", " ", texto).strip()


def fecha(texto):
    if not texto:
        return None
    texto = texto.strip()
    try:
        d = parsedate_to_datetime(texto)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(texto.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat()


def _local(tag):
    return tag.rsplit("}", 1)[-1]


def _hijo(el, nombre):
    for c in el:
        if _local(c.tag) == nombre:
            return c
    return None


def _texto(el, *nombres):
    for n in nombres:
        c = _hijo(el, n)
        if c is not None and (c.text or "").strip():
            return c.text
    return ""


def _xml(data):
    return ET.fromstring(re.sub(rb"^[^<]+", b"", data))


def _foto(it):
    for c in it.iter():
        nombre = _local(c.tag)
        if nombre in ("content", "thumbnail") and c.get("url") and c.get("medium", "image") == "image":
            return c.get("url")
        if nombre == "enclosure" and (c.get("type") or "").startswith("image"):
            return c.get("url")
    return ""


def parse_feed(data):
    """[{titulo, link, fecha, categorias, bajada, foto, contenido}] de un RSS 2.0 o Atom.

    `contenido` es el cuerpo que algunos medios mandan entero en el propio feed
    (content:encoded); sirve cuando la página de la nota no se deja leer.
    """
    raiz = _xml(data)
    notas = []
    for it in (e for e in raiz.iter() if _local(e.tag) in ("item", "entry")):
        link = _texto(it, "link")
        if not link:
            l = _hijo(it, "link")
            link = l.get("href", "") if l is not None else ""
        titulo = limpiar(_texto(it, "title"))
        if titulo and link:
            notas.append({
                "titulo": titulo,
                "link": link.strip(),
                "fecha": fecha(_texto(it, "pubDate", "published", "updated", "date")),
                "categorias": [limpiar(c.text or c.get("term", "")) for c in it if _local(c.tag) == "category"],
                "bajada": limpiar(_texto(it, "description", "summary"))[:400],
                "foto": _foto(it),
                "contenido": _texto(it, "encoded") or "",
            })
    return notas


def parse_sitemap(data):
    """Notas de un sitemap de noticias, o la lista de sitemaps hijos si es un índice."""
    raiz = _xml(data)
    if _local(raiz.tag) == "sitemapindex":
        return "indice", [_texto(s, "loc").strip() for s in raiz if _texto(s, "loc")]
    notas = []
    for u in raiz:
        loc = _texto(u, "loc").strip()
        news = _hijo(u, "news")
        if not loc:
            continue
        titulo = limpiar(_texto(news, "title")) if news is not None else ""
        cuando = _texto(news, "publication_date") if news is not None else _texto(u, "lastmod")
        notas.append({"titulo": titulo, "link": loc, "fecha": fecha(cuando), "categorias": []})
    if any(n["fecha"] for n in notas):
        notas.sort(key=lambda n: n["fecha"] or "", reverse=True)
    else:
        notas.reverse()  # sin fechas, los sitemaps listan de la más vieja a la más nueva
    return "notas", notas


def _probar_feed(url):
    r = bajar(url)
    if not r.ok:
        return None
    try:
        notas = parse_feed(r.cuerpo)
    except ET.ParseError:
        return None
    return notas if len(notas) >= 3 else None


def _probar_sitemap(url, profundidad=0):
    r = bajar(url)
    if not r.ok:
        return None
    try:
        tipo, cosas = parse_sitemap(r.cuerpo)
    except ET.ParseError:
        return None
    if tipo == "notas":
        return cosas if len(cosas) >= 3 else None
    if profundidad == 0:
        # El de noticias si hay; si no, la última página de notas (la más reciente).
        notas_de = [h for h in cosas if "post" in h.lower() and not OTRAS_LISTAS.search(h)]
        hijos = [h for h in cosas if "news" in h.lower()] or notas_de[-1:] or cosas[-1:]
        for h in hijos[:2]:
            notas = _probar_sitemap(h, 1)
            if notas:
                return notas
    return None


def descubrir(medio):
    """Devuelve (via, url, notas) sin notas pagas por anunciantes. via: 'rss', 'sitemap', 'google' o None."""
    via, url, notas = _descubrir(medio)
    return via, url, [n for n in notas if not PUBLICIDAD.search(n["link"])]


def _descubrir(medio):
    base = re.match(r"https?://[^/]+", medio["web"]).group(0)

    candidatos = [medio["feed"]] if medio.get("feed") else []
    portada = bajar(medio["web"])
    if portada.ok:
        texto = portada.cuerpo.decode("utf-8", "ignore")
        for tag in re.findall(r"<link[^>]+>", texto):
            if "alternate" in tag and ("rss" in tag or "atom" in tag):
                m = re.search(r'href=["\']([^"\']+)["\']', tag)
                if m:
                    candidatos.append(urljoin(medio["web"], html.unescape(m.group(1))))
    candidatos += [base + p for p in RUTAS_RSS]
    for url in dict.fromkeys(candidatos):
        notas = _probar_feed(url)
        if notas:
            return "rss", url, notas

    sitemaps = [medio["sitemap"]] if medio.get("sitemap") else []
    robots = bajar(base + "/robots.txt")
    if robots.ok:
        for linea in robots.cuerpo.decode("utf-8", "ignore").splitlines():
            if linea.lower().startswith("sitemap:"):
                sitemaps.append(linea.split(":", 1)[1].strip())
    sitemaps.sort(key=lambda s: "news" not in s.lower())
    sitemaps += [base + p for p in RUTAS_SITEMAP]
    for url in list(dict.fromkeys(sitemaps))[:8]:
        notas = _probar_sitemap(url)
        if notas:
            return "sitemap", url, notas

    dominio = re.sub(r"^https?://(www\.)?", "", base)
    url = GOOGLE_NEWS.format(dominio=dominio)
    notas = _probar_feed(url)
    if notas:
        for n in notas:
            n["titulo"] = re.sub(r"\s+-\s+[^-]{2,40}$", "", n["titulo"])
        return "google", url, notas
    return None, None, []


def link_real(link):
    """Traduce un link de Google News a la URL de la nota en el medio."""
    if "news.google.com" not in link:
        return link
    from googlenewsdecoder import gnewsdecoder
    r = gnewsdecoder(link, interval=1)
    return r.get("decoded_url") if r.get("status") or r.get("success") else None
