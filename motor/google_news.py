"""Titulares de Google News Argentina: una señal más para ordenar la tapa.

Sólo se usan los títulos, para saber qué hechos están arriba en Google en este momento. En el
diario nunca aparece una nota de Google ni de un medio que Lucca no eligió: la tapa muestra la
versión de sus medios, y si ninguno de ellos cuenta un hecho de Google, ese hecho no aparece.
Si Google no contesta o cambia sus listas, la tapa se ordena como antes (cobertura y frescura).
"""
import html
import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

from fuentes import _xml, bajar

REGION = "hl=es-419&gl=AR&ceid=AR:es-419"
TEMAS = "https://news.google.com/rss/headlines/section/topic/{}?" + REGION
# Lista de Google y cuánto suma su primer puesto. Los titulares generales pesan más que cada tema.
LISTAS = {
    "titulares": (f"https://news.google.com/rss?{REGION}", 3.0),
    "argentina": (TEMAS.format("NATION"), 1.5),
    "mundo": (TEMAS.format("WORLD"), 1.5),
    "negocios": (TEMAS.format("BUSINESS"), 1.5),
    "tecnologia": (TEMAS.format("TECHNOLOGY"), 1.5),
    "deportes": (TEMAS.format("SPORTS"), 1.5),
    "espectaculos": (TEMAS.format("ENTERTAINMENT"), 1.5),
}
POR_LISTA = 15  # los primeros puestos de cada lista; más abajo ya no es "lo destacado"


def _texto(valor):
    valor = html.unescape(valor or "")
    valor = re.sub(r"<font[^>]*>.*?</font>", " ", valor, flags=re.S)  # el nombre del medio de Google, afuera
    valor = re.sub(r"<[^>]+>", " ", valor)
    return re.sub(r"\s+", " ", valor.replace("\xa0", " ")).strip()


def _lista(nombre, url, peso):
    r = bajar(url, timeout=20)
    if not r.ok:
        print(f"Google News ({nombre}): {r.error or r.estado}")
        return []
    salida = []
    for puesto, item in enumerate(_xml(r.cuerpo).iter("item")):
        if puesto >= POR_LISTA:
            break
        titulo = html.unescape(item.findtext("title") or "")
        fuente = item.findtext("source") or ""
        if fuente and titulo.endswith(f" - {fuente}"):
            titulo = titulo[: -len(fuente) - 3]
        salida.append({
            "id": f"google-{nombre}-{puesto}",
            "medio": "google",
            "titulo": titulo.strip(),
            # La descripción trae los otros títulos del mismo hecho: ayuda a reconocerlo.
            "bajada": _texto(item.findtext("description"))[:240],
            "peso": round(peso * (1 - 0.6 * puesto / POR_LISTA), 2),
        })
    return salida


def titulares():
    """Los primeros titulares de cada lista de Google News Argentina, con su peso. Si falla: ninguno."""
    try:
        with ThreadPoolExecutor(max_workers=len(LISTAS)) as pool:
            listas = list(pool.map(lambda kv: _lista(kv[0], *kv[1]), LISTAS.items()))
    except Exception as e:  # nunca frena la edición
        print(f"Google News no se pudo leer ({type(e).__name__}); la tapa se ordena sin él")
        return []
    return [t for lista in listas for t in lista]


if __name__ == "__main__":
    for t in titulares()[:10]:
        print(t["peso"], t["titulo"][:80])
