"""Avisos de último momento: cuando un hecho muy importante explota en muchos medios a la vez, le
llega una notificación al iPhone y al iPad de Lucca (Web Push, sin servidor propio: la manda la
misma tarea que arma la edición, después de publicarla).

Qué cuenta como último momento:
  1. Lo cuentan al menos 4 de los medios de Lucca, con 3 notas o más de las últimas 3 horas y la más
     nueva de menos de 90 minutos. O está entre los 3 primeros titulares de Google News Argentina,
     lo cuentan al menos 3 de sus medios y la más nueva tiene menos de 90 minutos.
  2. Gemini confirma que es de peso: una catástrofe, la muerte de una personalidad, un hecho político
     grave o sorpresivo (no el dólar de todos los días, un partido o una tendencia). Si Gemini agrupó los
     hechos pero no puede confirmar, pasa sólo lo enorme (6 medios o más). Sin Gemini no hay grupos de
     hechos, así que no hay avisos.
Límites: cada hecho se avisa una sola vez (ni con otras notas sobre lo mismo); como mucho 4 avisos en
24 horas, sin excepciones; de 0 a 7 (hora de Córdoba) sólo lo enorme. Sin la edición anterior (sin
historial) no se avisa, para no repetir. La notificación lleva el título de la nota de sus medios y
abre esa nota, que se mantiene en la edición mientras dure el historial.

    python motor/avisos.py --enviar avisos.json     # lo corre la tarea, después de publicar
    python motor/avisos.py --frenada 75             # lo corre el vigía si la edición no sale hace 75 min
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ia import MODELOS, _clave, _generar, _mismo_hecho  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
HORA_ARGENTINA = timezone(timedelta(hours=-3))
SITIO = "https://luccaguizzardi1-ui.github.io"  # "sub" de VAPID: quién manda los avisos
MAX_POR_DIA = 4

GUIA = """Te paso hechos que en este momento cuentan muchos medios a la vez (título y bajada de cada nota).
Para cada uno decidí si es una noticia de ÚLTIMO MOMENTO que justifica interrumpir a alguien con una notificación
en el teléfono: una catástrofe o tragedia grande, la muerte de una personalidad, un hecho político grave o
sorpresivo (renuncia, atentado, golpe, resultado electoral, anuncio de enorme impacto), una noticia mundial mayor.
NO lo son: el dólar o el riesgo país de todos los días, un partido o un resultado deportivo común, espectáculos,
tendencias, servicios, ni la continuidad de algo que ya se sabía. Ante la duda, no.
En "mejor" poné el id del título que mejor cuenta el hecho en una línea (el más informativo, no el más llamativo)."""

ESQUEMA = {"type": "ARRAY", "items": {
    "type": "OBJECT",
    "properties": {
        "id": {"type": "STRING"},
        "ultimo_momento": {"type": "BOOLEAN"},
        "tipo": {"type": "STRING", "enum": ["catastrofe", "muerte", "politica", "mundo", "otro"]},
        "mejor": {"type": "STRING"},
    },
    "required": ["id", "ultimo_momento", "tipo", "mejor"]}}


def _fecha(n):
    try:
        d = datetime.fromisoformat((n.get("publicada") or n.get("fecha") or "").replace("Z", "+00:00"))
    except ValueError:
        return datetime(2000, 1, 1, tzinfo=timezone.utc)
    # Algunos medios ponen la fecha sin zona ("2026-10-27"): es hora de Argentina. Sin esto, comparar
    # con fechas con zona rompe la edición entera (pasó el 27/10).
    return d if d.tzinfo else d.replace(tzinfo=timezone(timedelta(hours=-3)))


def _mejor(ns):
    return max(ns, key=lambda n: (not n["a_medias"], bool(n["foto"]), bool(n.get("cuerpo_html")), _fecha(n)))


def candidatos(edicion, ahora):
    por_id = {n["id"]: n for n in edicion["notas"]}
    google = edicion.get("google", {})
    salida = []
    for ids in edicion.get("temas", []):
        ns = [por_id[i] for i in ids if i in por_id]
        if not ns:
            continue
        medios = {n["medio"] for n in ns}
        recientes = [n for n in ns if ahora - _fecha(n) <= timedelta(hours=3)]
        nueva = max(_fecha(n) for n in ns)
        if ahora - nueva > timedelta(minutes=90):
            continue
        arriba_en_google = max((google.get(i, 0) for i in ids), default=0) >= 2.7  # 3 primeros titulares
        if (len(medios) >= 4 and len(recientes) >= 3) or (arriba_en_google and len(medios) >= 3):
            salida.append({"ids": ids, "medios": len(medios), "nota": _mejor(ns), "notas": ns, "arriba_en_google": arriba_en_google})
    return sorted(salida, key=lambda c: c["medios"], reverse=True)


def confirmar(cands):
    """Gemini descarta lo que no es de último momento. Sin Gemini, pasa sólo lo enorme."""
    clave = _clave()
    if not cands:
        return []
    if clave:
        lista = [{"id": c["nota"]["id"], "medios_que_lo_cuentan": c["medios"],
                  "titulos": [{"id": n["id"], "titulo": n["titulo"], "bajada": (n.get("bajada") or "")[:200]} for n in c["notas"][:8]]}
                 for c in cands]
        for modelo in MODELOS:
            try:
                veredictos = {v["id"]: v for v in _generar(modelo, clave, GUIA, ESQUEMA, lista)}
                salida = []
                for c in cands:
                    v = veredictos.get(c["nota"]["id"], {})
                    if v.get("ultimo_momento"):
                        mejor = next((n for n in c["notas"] if n["id"] == v.get("mejor") and n.get("cuerpo_html")), c["nota"])
                        salida.append(dict(c, tipo=v["tipo"], nota=mejor))
                return salida
            except Exception as e:
                print(f"Gemini ({modelo}) no confirmó los avisos ({type(e).__name__})")
    return [dict(c, tipo="otro") for c in cands if c["medios"] >= 6]


def detectar(edicion, anteriores, nombres, ahora=None):
    """Los avisos para mandar con esta edición y el historial actualizado (queda en la edición cifrada)."""
    ahora = ahora or datetime.now(timezone.utc)
    historial = [a for a in anteriores if ahora - datetime.fromisoformat(a["hora"]) <= timedelta(hours=48)]
    ya_avisados = {i for a in historial for i in a["ids"]}
    del_dia = [a for a in historial if ahora - datetime.fromisoformat(a["hora"]) <= timedelta(hours=24)]
    madrugada = ahora.astimezone(HORA_ARGENTINA).hour < 7
    cands = [c for c in candidatos(edicion, ahora)
             if not ya_avisados & set(c["ids"]) and not any(_mismo_hecho(c["nota"], a) for a in historial)]
    pendientes = []
    for c in confirmar(cands):
        enorme = c["medios"] >= 6
        if madrugada and not enorme:
            continue
        if len(del_dia) + len(pendientes) >= MAX_POR_DIA:
            continue
        n = c["nota"]
        otros = c["medios"] - 1
        pendientes.append({
            "nota": n["id"],
            "titulo": n["titulo"][:160],
            "cuerpo": f"Último momento · {nombres.get(n['medio'], n['medio'])}"
                      + (f" y {otros} {'medio' if otros == 1 else 'medios'} más" if otros else ""),
            "ids": c["ids"],
            "hora": ahora.isoformat(timespec="seconds"),
        })
    return pendientes, historial + [{k: a[k] for k in ("nota", "titulo", "ids", "hora")} for a in pendientes]


def suscripciones():
    """Una suscripción por equipo, cada una en su secreto AVISOS_* (AVISOS_IPHONE, AVISOS_IPAD)."""
    valores = {k: v for k, v in os.environ.items() if k.startswith("AVISOS_") and v.strip()}
    env = ROOT / ".env"
    if env.exists():
        for linea in env.read_text().splitlines():
            if linea.startswith("AVISOS_") and "=" in linea:
                k, v = linea.split("=", 1)
                valores.setdefault(k, v.strip())
    salida = {}
    for k, v in valores.items():
        try:
            salida[k] = json.loads(v)
        except json.JSONDecodeError:
            print(f"{k} no es un código de avisos válido (tiene que ser el que copia la app)")
    return salida


def enviar(pendientes):
    if not pendientes:
        return
    from pywebpush import WebPushException, webpush
    env = ROOT / ".env"
    privada = os.environ.get("VAPID_PRIVADA") or next(
        (l.split("=", 1)[1].strip() for l in (env.read_text().splitlines() if env.exists() else []) if l.startswith("VAPID_PRIVADA=")), "")
    equipos = suscripciones()
    vencidas = []
    if not privada or not equipos:
        print(f"{len(pendientes)} aviso(s) para mandar, pero faltan {'la clave VAPID' if not privada else 'los códigos de avisos'}")
        return
    for aviso in pendientes:
        datos = json.dumps({"titulo": aviso["titulo"], "cuerpo": aviso["cuerpo"], "nota": aviso["nota"]}, ensure_ascii=False)
        for nombre, sub in equipos.items():
            try:
                webpush(sub, datos, vapid_private_key=privada, vapid_claims={"sub": SITIO}, ttl=3 * 3600,
                        headers={"Urgency": "high"}, timeout=20)
                print(f"Aviso enviado a {nombre}: {aviso['titulo'][:70]}")
            except WebPushException as e:
                estado = getattr(e.response, "status_code", None)
                if estado in (404, 410):
                    print(f"{nombre}: la suscripción venció; hay que volver a activar los avisos en ese equipo")
                    vencidas.append(nombre)
                else:
                    print(f"{nombre}: no se pudo mandar el aviso (HTTP {estado})")
            except Exception as e:  # un aviso que falla nunca frena nada
                print(f"{nombre}: no se pudo mandar el aviso ({type(e).__name__})")
    if vencidas:
        # El job queda en rojo y GitHub manda un mail: así te enterás de que hay que reactivarlos.
        sys.exit(f"Avisos vencidos en {', '.join(sorted(set(vencidas)))}: volvé a activarlos en ese equipo y pegá el código nuevo en GitHub.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--enviar", help="archivo con los avisos pendientes que dejó publicar.py")
    ap.add_argument("--prueba", action="store_true", help="manda un aviso de prueba a cada equipo")
    ap.add_argument("--frenada", type=int, metavar="MIN", help="avisa que la edición no sale hace MIN minutos")
    args = ap.parse_args()
    if args.frenada:
        h, m = divmod(args.frenada, 60)
        hace = f"{h} h {m:02d} min" if m else f"{h} h"
        enviar([{"nota": "", "titulo": "La edición está frenada",
                 "cuerpo": f"No sale una edición nueva hace {hace}. El vigía ya está intentando retomarla."}])
        return
    if args.prueba:
        enviar([{"nota": "", "titulo": "Los avisos de último momento funcionan",
                 "cuerpo": "Prueba de el diario del pelado: cuando pase algo grande, te llega así."}])
        return
    ruta = Path(args.enviar or "avisos.json")
    enviar(json.loads(ruta.read_text()) if ruta.exists() else [])


if __name__ == "__main__":
    main()
