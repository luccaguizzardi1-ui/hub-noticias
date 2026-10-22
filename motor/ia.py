"""Gemini sólo elige la sección de cada nota nueva. Nunca ve ni toca el cuerpo.

Le llegan el título, la bajada, el medio y la sección que declara el medio; devuelve
una categoría de la lista de categorias.py. Si no hay clave, si falla o si responde
algo fuera de la lista, queda la que dieron las reglas.
"""
import json
import os
import urllib.request
from pathlib import Path

from categorias import CATEGORIAS

MODELOS = ("gemini-3.5-flash-lite", "gemini-flash-latest")
POR_PEDIDO = 40
IDS = [c for c, _ in CATEGORIAS]

GUIA = """Ordenás las notas de un diario personal argentino en secciones. Para cada nota elegí UNA:
- politica: política argentina. Gobierno nacional, provincias, Congreso, partidos, elecciones, causas judiciales
  de políticos argentinos y la relación de la Argentina con otros países (Milei de viaje, lo que EE.UU. dice de una ley argentina).
- internacional: lo que pasa fuera de la Argentina y no la involucra: política de otros países (España, EE.UU.,
  Brasil, Europa), guerras, diplomacia, el Papa, y también crímenes, catástrofes, clima y epidemias de otros países.
- economia: economía, dólar, inflación, mercados, empresas, finanzas, campo, de acá o del mundo.
- sociedad: sociedad y policiales de la Argentina: crímenes, justicia común, salud, educación, clima, tránsito,
  ciudad, vida cotidiana. Salud o bienestar sin un país en particular también va acá.
- tecnologia: inteligencia artificial, tecnología, internet, ciencia, espacio, videojuegos.
- deportes: deportes.
- cultura: espectáculos, música, cine, series, televisión, libros, arte, famosos.
- otras: lo que no entra en ninguna (estilo de vida, turismo, gastronomía, servicios, horóscopo).
Decidí por el tema central de la nota, no por la sección donde la publicó el medio. Devolvé una entrada por nota, con su id."""


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
        lista = [{"id": n["id"], "medio": nombres.get(n["medio"], n["medio"]), "seccion_del_medio": n.get("seccion", ""),
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
                n["categoria"] = elegidas[n["id"]]
                n["por_ia"] = True
                hechas += 1
    return hechas
