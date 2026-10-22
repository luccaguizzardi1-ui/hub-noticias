"""Gemini sólo elige la sección de cada nota nueva. Nunca ve ni toca el cuerpo.

Le llegan el título, la bajada, el medio y la sección que declara el medio; devuelve
una categoría de la lista de categorias.py. Si no hay clave, si falla o si responde
algo fuera de la lista, queda la que dieron las reglas.
"""
import json
import os
import urllib.request
from pathlib import Path

from categorias import CATEGORIAS, DE_AFUERA, con_perspectiva

MODELOS = ("gemini-3.5-flash-lite", "gemini-flash-latest")
# Sube cuando cambia el criterio: las notas revisadas con uno anterior se vuelven a ordenar.
CRITERIO = 3
POR_PEDIDO = 40
IDS = [c for c, _ in CATEGORIAS]

GUIA = """Ordenás las notas de un diario personal argentino en secciones. Para cada nota elegí UNA:
- politica: política argentina contada por un medio argentino. Gobierno nacional, provincias, Congreso, partidos,
  elecciones, causas judiciales de políticos argentinos y la relación de la Argentina con otros países
  (Milei de viaje, lo que EE.UU. dice de una ley argentina).
- internacional: política internacional y geopolítica de todo el mundo. Todo lo político que no es local de la
  Argentina: gobiernos, elecciones, partidos y líderes de otros países, diplomacia, guerras y conflictos armados,
  la ONU, la OTAN, la UE. Y la geopolítica en general: alianzas, sanciones, potencias, rutas y recursos estratégicos
  (petróleo, gas, Ormuz, chips) cuando el ángulo es el poder entre países y no el negocio. También la política
  argentina cuando la cuenta un medio de otro país ("de_afuera": true), porque es la mirada de afuera.
  Un crimen, un accidente, una catástrofe, el clima o una epidemia en otro país NO van acá.
- economia: economía, dólar, inflación, mercados, empresas, finanzas, campo, de acá o del mundo.
- sociedad: sociedad y policiales, de acá o de cualquier país: crímenes, justicia común, accidentes, catástrofes,
  clima, salud, epidemias, educación, religión, tránsito, ciudad, vida cotidiana.
- tecnologia: inteligencia artificial, tecnología, internet, ciencia, espacio, videojuegos.
- deportes: deportes.
- cultura: espectáculos, música, cine, series, televisión, libros, arte, famosos.
- otras: lo que no entra en ninguna (estilo de vida, turismo, gastronomía, servicios, horóscopo).
Decidí por el tema central de la nota, no por la sección donde la publicó el medio ni por el país. Antes de elegir
internacional preguntate si la nota trata de gobiernos, partidos, elecciones, el Estado, diplomacia, guerra o
del poder entre países; si no
(una estafa, un plan de negocios, el turismo, la basura, un homicidio en otro país), elegí su tema.
Devolvé una entrada por nota, con su id."""


def _clave():
    clave = os.environ.get("GEMINI_API_KEY", "")
    env = Path(__file__).resolve().parent.parent / ".env"
    if not clave and env.exists():
        for linea in env.read_text().splitlines():
            if linea.startswith("GEMINI_API_KEY="):
                clave = linea.split("=", 1)[1].strip().strip("\"'")
    return clave


def _pedir(modelo, clave, lista):
    cuerpo = {
        "systemInstruction": {"parts": [{"text": GUIA}]},
        "contents": [{"role": "user", "parts": [{"text": json.dumps(lista, ensure_ascii=False)}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": {"type": "ARRAY", "items": {
                "type": "OBJECT",
                "properties": {"id": {"type": "STRING"}, "categoria": {"type": "STRING", "enum": IDS}},
                "required": ["id", "categoria"]}},
        },
    }
    pedido = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent",
        data=json.dumps(cuerpo).encode(),
        headers={"x-goog-api-key": clave, "content-type": "application/json"})  # la clave nunca va en la dirección
    respuesta = json.load(urllib.request.urlopen(pedido, timeout=90))
    texto = respuesta["candidates"][0]["content"]["parts"][0]["text"]
    return {x["id"]: x["categoria"] for x in json.loads(texto) if x.get("categoria") in IDS}


def clasificar_con_ia(notas, nombres):
    """Pone la categoría que elige Gemini en las notas dadas. Devuelve cuántas clasificó."""
    clave = _clave()
    if not clave or not notas:
        return 0
    hechas = 0
    for i in range(0, len(notas), POR_PEDIDO):
        tanda = notas[i:i + POR_PEDIDO]
        lista = [{"id": n["id"], "medio": nombres.get(n["medio"], n["medio"]), "de_afuera": n["medio"] in DE_AFUERA,
                  "seccion_del_medio": n.get("seccion", ""),
                  "titulo": n["titulo"], "bajada": (n.get("bajada") or "")[:300]} for n in tanda]
        elegidas = {}
        for modelo in MODELOS:
            try:
                elegidas = _pedir(modelo, clave, lista)
                break
            except Exception as e:  # sin detalles: el error podría traer datos del pedido
                print(f"Gemini ({modelo}) no respondió ({type(e).__name__}); quedan las reglas")
        for n in tanda:
            if n["id"] in elegidas:
                n["categoria"] = con_perspectiva(elegidas[n["id"]], n["medio"])
                n["por_ia"] = CRITERIO
                hechas += 1
    return hechas
