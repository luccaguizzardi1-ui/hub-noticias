"""Categoría de cada nota, sin IA: sale de lo que el propio medio dice de ella.

En orden de confianza:
  1. la sección que declara el medio (Arc, JSON-LD, article:section) y la de su RSS;
  2. la dirección de la nota (/politica/, /el-mundo/, /deportes/...);
  3. lo que se sabe del medio (Xataka es tecnología; El País mira la Argentina desde afuera);
  4. palabras del título y la bajada, como último recurso.
Lo que no encaja en nada va a "Otras".
"""
import re
import unicodedata
from urllib.parse import urlparse

CATEGORIAS = [
    ("politica", "Política argentina"),
    ("internacional", "Política internacional"),
    ("economia", "Economía"),
    ("sociedad", "Sociedad y policiales"),
    ("tecnologia", "IA y tecnología"),
    ("deportes", "Deportes"),
    ("cultura", "Cultura y espectáculos"),
    ("otras", "Otras"),
]

# Medios que miran la Argentina desde afuera (el grupo "afuera" de datos/medios.json): su política,
# aunque sea sobre la Argentina, va a Política internacional, porque es la mirada de otro país.
DE_AFUERA = {"elpais", "elmundo", "bbcmundo", "cnnespanol", "nytes", "elordenmundial", "legrandcontinent", "infobaeamerica"}
POR_DEFECTO = {"xataka": "tecnologia", "hipertextual": "tecnologia", "bloomberglinea": "economia",
               "lpo": "politica", "letrap": "politica", "elalfil": "politica"}

PAISES = (
    "panama honduras colombia venezuela mexico chile brasil uruguay paraguay bolivia peru ecuador nicaragua guatemala "
    "el-salvador salvador costa-rica cuba republica-dominicana puerto-rico canada eeuu estados-unidos ee-uu usa "
    "espana francia italia alemania reino-unido inglaterra portugal rusia ucrania china japon india iran israel gaza "
    "palestina siria libano turquia corea africa asia europa oriente-medio medio-oriente america-latina latinoamerica "
    "centroamerica caribe oceania australia vaticano"
).split()

# Palabras de sección o de dirección, por categoría (sin tildes, en minúscula, con guiones).
SECCIONES = {
    "deportes": "deportes deporte futbol automovilismo formula-1 f1 tenis rugby basquet boxeo olimpicos polideportivo ole",
    "tecnologia": "tecnologia tecno ciencia inteligencia-artificial ia innovacion internet gadgets apps ciberseguridad "
                  "videojuegos gaming moviles espacio malditos-nerds",
    "cultura": "espectaculos cultura show teleshow entretenimiento musica cine series series-y-peliculas peliculas "
               "television tv famosos libros teatro arte gente celebrities que-sale cine-television fama "
               "cuarteteando",
    "economia": "economia finanzas mercados dolar negocios empresas campo agro inversiones empresas-y-protagonistas "
                "cripto criptomonedas",
    "sociedad": "sociedad policiales policial seguridad salud educacion informacion-general general ciudad clima "
                "transito sucesos actualidad judiciales tendencias",
    "internacional": "internacional internacionales el-mundo mundo america latinoamerica " + " ".join(PAISES),
    "politica": "politica el-pais congreso elecciones gobierno legislatura provincias opinion modo-fontevecchia "
                "politica-y-economia",
    "otras": "lifestyle turismo gastronomia bienestar viajes horoscopo",
}

# Último recurso: palabras del título y la bajada.
PALABRAS = {
    "politica": "milei kicillof cristina kirchner massa macri villarruel francos adorni karina congreso diputados "
                "senado senador diputada diputado casa-rosada gobernador gobernadora intendente legislatura peronismo "
                "kirchnerismo libertarios la-libertad-avanza union-por-la-patria balotaje-argentino oposicion bullrich",
    "internacional": "trump lula bolsonaro putin zelenski ucrania rusia israel gaza hamas iran china xi maduro venezuela "
                     "chile kast boric brasil eeuu estados-unidos europa francia macron espana sanchez feijoo onu otan "
                     "papa vaticano",
    "economia": "dolar inflacion mercados bolsa acciones merval riesgo-pais reservas banco-central bcra fmi tasas "
                "plazo-fijo exportaciones importaciones bitcoin recesion pbi emae",
    "deportes": "futbol boca river seleccion messi colapinto formula-1 gol torneo copa mundial rugby pumas tenis "
                "libertadores",
    "tecnologia": "inteligencia-artificial openai chatgpt gemini google apple meta microsoft nvidia iphone android "
                  "ciberataque hackers software robot nasa satelite",
    "cultura": "pelicula serie netflix musica cantante actor actriz recital festival libro escritor teatro "
               "martin-fierro famosos streaming",
    "sociedad": "policia detenido detenida crimen homicidio asesinato accidente choque robo preso presos carcel "
                "alcaidia hospital escuela tormenta alerta lluvia transito apagon femicidio",
}


def _norm(texto):
    texto = unicodedata.normalize("NFKD", (texto or "").lower())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", texto).strip("-")


_SECCION = {cat: set(palabras.split()) for cat, palabras in SECCIONES.items()}
_PALABRA = {cat: palabras.split() for cat, palabras in PALABRAS.items()}
_ORDEN_SECCION = ["deportes", "tecnologia", "cultura", "economia", "sociedad", "otras", "internacional", "politica"]


def _por_seccion(etiquetas):
    for cat in _ORDEN_SECCION:
        if any(e in _SECCION[cat] for e in etiquetas):
            return cat
    return None


def _por_palabras(texto):
    t = f"-{_norm(texto)}-"
    puntos = {cat: sum(t.count(f"-{p}-") for p in palabras) for cat, palabras in _PALABRA.items()}
    mejor = max(puntos, key=lambda c: (puntos[c], -list(_PALABRA).index(c)))
    return mejor if puntos[mejor] else None


def clasificar(nota, medio_id, categorias_rss=()):
    # Etiquetas: la sección declarada, las del RSS y los tramos de la dirección.
    seccion = nota.get("seccion", "") or ""
    if seccion.startswith("http"):  # Perfil declara la sección como una dirección
        seccion = urlparse(seccion).path.rstrip("/").rsplit("/", 1)[-1]
    etiquetas = [_norm(seccion)] + [_norm(c) for c in categorias_rss]
    etiquetas += [_norm(x) for x in urlparse(nota.get("url", "")).path.split("/") if x and not x.isdigit()][:3]
    etiquetas = [e for e in etiquetas if e]
    texto = f"{nota.get('titulo', '')} {nota.get('bajada', '')}"

    if medio_id in ("xataka", "hipertextual"):
        return "cultura" if _por_seccion(etiquetas) == "cultura" else "tecnologia"

    cat = _por_seccion(etiquetas)
    tema = _por_palabras(texto)
    # "Internacional" es política internacional: un crimen o un temporal de afuera va a su tema.
    if cat == "internacional" and tema in ("sociedad", "economia", "deportes", "tecnologia", "cultura"):
        return tema
    if medio_id in DE_AFUERA:
        if cat is None and tema in ("sociedad", "economia", "deportes", "tecnologia", "cultura"):
            return tema
        return "internacional" if cat in (None, "politica") else cat
    if cat == "politica" and tema == "internacional":
        return "internacional"  # p. ej. Letra P sobre el balotaje de Lula, en su sección Política
    return cat or POR_DEFECTO.get(medio_id) or tema or "otras"


def con_perspectiva(cat, medio_id):
    """La política que cuenta un medio de afuera, aunque sea sobre la Argentina, es Política internacional."""
    return "internacional" if cat == "politica" and medio_id in DE_AFUERA else cat
