#!/usr/bin/env bash
# El reloj de la edición: lo usan los workflows "Edición" y "Vigía" (ver sus encabezados).
#   reloj.sh completar           duerme lo que falte para 20 minutos desde el comienzo de esta corrida
#   reloj.sh pedir <archivo> [min]  pide una corrida, con reintentos durante [min] minutos (60)
#   reloj.sh vivas <archivo>     cuántas corridas del workflow están pedidas, esperando o en curso
#   reloj.sh revisar             (vigía) retoma la edición si su cadena se cortó y destraba corridas
#   reloj.sh frenada             (vigía) avisa al teléfono si la edición publicada tiene más de una hora
#   reloj.sh latido              pide el latido si el repo lleva 30 días sin cambios
# Con SECO=1 no pide ni cancela nada: sólo dice qué haría (para probarlo desde la compu).
set -uo pipefail
: "${REPO:?falta REPO}"
RAMA=${RAMA:-main}

api() { timeout 30 gh api "$@" 2>/dev/null; }
hacer() { if [ "${SECO:-}" = 1 ]; then echo "[seco] $*"; else "$@"; fi; }

completar() {
  # El entorno ya esperó 19 minutos; esto ajusta al 20. Si no puede leer el comienzo, confía en el
  # entorno y duerme 1 minuto (sin el entorno, el comienzo legible igual sostiene los 20).
  local inicio="" desde espera i
  for i in 1 2 3; do
    inicio=$(api "repos/$REPO/actions/runs/${RUN_ID:?}" --jq .run_started_at) \
      && [[ $inicio =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z$ ]] && break
    inicio=""; sleep 5
  done
  if [ -n "$inicio" ]; then desde=$(date -d "$inicio" +%s)
  else echo "::warning::No pude leer el comienzo de la corrida"; desde=$(( $(date +%s) - 1140 )); fi
  espera=$(( 1200 - ($(date +%s) - desde) ))
  (( espera > 1200 )) && espera=1200
  if (( espera > 0 )); then echo "Faltan $espera s para los 20 minutos"; sleep "$espera"; fi
  return 0
}

pedir() {
  # Deshabilitar un workflow a mano es la forma de frenarlo: no se lo pide. Si lo deshabilitó GitHub
  # por inactividad (60 días), se lo vuelve a habilitar.
  local archivo=$1 minutos=${2:-60} fin intento=0 pausa
  case "$(api "repos/$REPO/actions/workflows/$archivo" --jq .state || true)" in
    disabled_manually) echo "$archivo está deshabilitado a mano: no lo pido."; return 0 ;;
    disabled_inactivity) echo "::warning::GitHub deshabilitó $archivo por inactividad: lo habilito"
                         hacer timeout 30 gh workflow enable "$archivo" --repo "$REPO" || true ;;
  esac
  fin=$(( $(date +%s) + minutos * 60 ))
  while :; do
    intento=$(( intento + 1 ))
    if hacer timeout 60 gh workflow run "$archivo" --repo "$REPO" --ref "$RAMA"; then echo "Pedí $archivo."; return 0; fi
    pausa=$(( intento < 5 ? 15 * 2 ** intento : 300 ))   # 30 s, 1, 2 y 4 min; después cada 5
    (( $(date +%s) + pausa > fin )) && break
    echo "No se pudo pedir $archivo (intento $intento): reintento en $pausa s"
    sleep "$pausa"
  done
  echo "::error::No pude pedir $archivo durante $minutos minutos"
  return 1
}

vivas() {
  api "repos/$REPO/actions/workflows/$1/runs?per_page=20" --jq '[.workflow_runs[] | select(.status != "completed")] | length'
}

revisar() {
  # Cadena cortada: ninguna corrida viva y la última de hace más de 25 minutos -> pide una edición.
  # Trabada: viva hace más de 130 minutos desde su primer job (una normal dura ~20 y, con todos los
  # topes y reintentos, no pasa de ~110) -> se cancela para liberar el grupo.
  local corridas ahora id inicio vivas ultima
  corridas=$(api "repos/$REPO/actions/workflows/edicion.yml/runs?per_page=15" --jq '[.workflow_runs[] | {id, status, created_at}]')
  if ! jq -e 'type == "array"' <<<"$corridas" >/dev/null 2>&1; then
    echo "::warning::No pude leer las corridas de la edición"; return 0
  fi
  ahora=$(date +%s)
  for id in $(jq -r --argjson ahora "$ahora" '.[] | select(.status != "completed" and .status != "pending")
              | select($ahora - (.created_at | fromdateiso8601) > 7800) | .id' <<<"$corridas"); do
    inicio=$(api "repos/$REPO/actions/runs/$id/jobs" --jq '[.jobs[].created_at | fromdateiso8601] | min // empty' || true)
    if [ -n "$inicio" ] && (( ahora - inicio > 7800 )); then
      echo "::warning::La edición $id está trabada hace $(( (ahora - inicio) / 60 )) min: la cancelo"
      hacer timeout 30 gh run cancel "$id" --repo "$REPO" || true
    fi
  done
  vivas=$(jq '[.[] | select(.status != "completed")] | length' <<<"$corridas")
  ultima=$(jq '[.[].created_at | fromdateiso8601] | max // 0' <<<"$corridas")
  if (( vivas > 0 )); then echo "La cadena de la edición sigue ($vivas corrida(s) viva(s))."; return 0; fi
  if (( ahora - ultima < 1500 )); then echo "La última edición es de hace menos de 25 minutos."; return 0; fi
  echo "::warning::La cadena de la edición estaba cortada: pido una edición"
  pedir edicion.yml 15
}

frenada() {
  # Mira la edición que de verdad está publicada (no las corridas): así cubre cualquier causa. Avisa al
  # cruzar la hora y después cada 6, en la ventana de 25 minutos de un vigía (si cae en dos, el segundo
  # aviso reemplaza al primero en el teléfono). Nunca hace fallar al vigía.
  local sitio generada ts edad
  sitio="https://$(tr '[:upper:]' '[:lower:]' <<<"${REPO%%/*}").github.io/${REPO#*/}"
  generada=$(curl -fsS --max-time 20 "$sitio/version.json?t=$(date +%s)" | jq -r '.generada // empty' 2>/dev/null)
  ts=$(date -d "$generada" +%s 2>/dev/null)
  if [ -z "$ts" ]; then echo "::warning::No pude leer la edición publicada"; return 0; fi
  edad=$(( ($(date +%s) - ts) / 60 ))
  echo "La edición publicada es de hace $edad min."
  (( edad < 60 )) && return 0
  echo "::warning::La edición no sale hace $edad minutos"
  (( (edad - 60) % 360 < 25 )) || return 0
  if [ "${SECO:-}" = 1 ]; then echo "[seco] aviso al teléfono: frenada hace $edad min"; return 0; fi
  python3 -m venv /tmp/avisos && /tmp/avisos/bin/pip install -q pywebpush==2.5.0 \
    && /tmp/avisos/bin/python motor/avisos.py --frenada "$edad" || true
}

latido() {
  # GitHub deshabilita los workflows con cron de un repo público que pasa 60 días sin cambios.
  local ultimo ts ult
  ultimo=$(api "repos/$REPO/commits?per_page=1" --jq '.[0].commit.committer.date') || return 0
  ts=$(date -d "$ultimo" +%s 2>/dev/null) || return 0
  (( $(date +%s) - ts > 30 * 86400 )) || return 0
  ult=$(api "repos/$REPO/actions/workflows/latido.yml/runs?per_page=1" --jq '.workflow_runs[0] | "\(.created_at) \(.conclusion)"' || true)
  if [ -n "$ult" ] && [ "${ult%% *}" != null ] && (( $(date +%s) - $(date -d "${ult%% *}" +%s) < 86400 )); then
    [[ $ult == *failure ]] && echo "::warning::El latido falló: https://github.com/$REPO/actions/workflows/latido.yml"
    return 0
  fi
  pedir latido.yml 5 || true
}

case "${1:-}" in
  completar) completar ;;
  pedir) pedir "${2:?archivo}" "${3:-60}" ;;
  vivas) vivas "${2:?archivo}" ;;
  revisar) revisar ;;
  frenada) frenada ;;
  latido) latido ;;
  *) echo "uso: reloj.sh completar|pedir <archivo> [min]|vivas <archivo>|revisar|frenada|latido" >&2; exit 2 ;;
esac
