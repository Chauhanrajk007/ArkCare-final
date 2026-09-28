#!/usr/bin/env bash
# start-ngrok.sh - expose the local ArkCare frontend over HTTPS via ngrok, and
# point NEXT_PUBLIC_APP_URL at the tunnel so Agora, sockets and the
# Razorpay/QStash callbacks resolve to the public URL.
#
# Usage:
#   ./scripts/start-ngrok.sh            start the tunnel, print + record the URL
#   ./scripts/start-ngrok.sh --stop     stop the tunnel only
#   ./scripts/start-ngrok.sh --status   show the current tunnel URL
#
# Only port 3000 is exposed. The CareQuest bridge (:8546) stays on loopback and
# is never tunnelled - the signing key must not leave this machine.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib-local.sh
source "$SCRIPT_DIR/lib-local.sh"

ENVFILE="$ARK_ROOT/Frontend/.env.local"
NGROK_API="http://127.0.0.1:4040"
LOG="$LOG_DIR/ngrok.log"
mkdir -p "$LOG_DIR"

public_url() {
  curl -fsS --max-time 4 "$NGROK_API/api/tunnels" 2>/dev/null \
    | grep -oE '"public_url":"https://[^"]+"' \
    | head -1 | cut -d'"' -f4
}

case "${1:-}" in
--stop)
  pid="$(pgrep -f "ngrok http ${WEB_PORT}" | head -1 || true)"
  if [ -n "$pid" ]; then
    kill -TERM "$pid" 2>/dev/null || true
    echo "ngrok stopped (pid $pid)."
  else
    echo "No ngrok tunnel running."
  fi
  exit 0
  ;;
--status)
  url="$(public_url || true)"
  [ -n "$url" ] && echo "$url  ->  127.0.0.1:${WEB_PORT}" || echo "No tunnel running."
  exit 0
  ;;
esac

command -v ngrok >/dev/null 2>&1 || {
  echo "ERR ngrok is not on PATH." >&2
  echo "  install:   brew install ngrok   (or see ngrok.com/download)"
  echo "  authtoken: ngrok config add-authtoken <YOUR_TOKEN>" >&2
  exit 1
}

http_ok "$WEB_URL" || {
  echo "ERR Nothing answering on ${WEB_URL}" >&2
  echo "Start the app first:" >&2
  echo "  ./scripts/start-local-all.sh" >&2
  exit 1
}

info "Starting ngrok tunnel to 127.0.0.1:${WEB_PORT} ..."
setsid nohup ngrok http "$WEB_PORT" --log=stdout >"$LOG" 2>&1 &

url=""
for _ in $(seq 1 20); do
  sleep 1
  url="$(public_url || true)"
  [ -n "$url" ] && break
done

if [ -z "$url" ]; then
  die "Could not read the public URL from the ngrok API on ${NGROK_API}. Check $LOG"
fi

# NEXT_PUBLIC_* values are inlined at build time, so this has to be written
# BEFORE `next build` / `next dev` is (re)started to take effect.
touch "$ENVFILE"
if grep -q '^NEXT_PUBLIC_APP_URL=' "$ENVFILE"; then
  sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=${url}|" "$ENVFILE"
else
  printf 'NEXT_PUBLIC_APP_URL=%s\n' "$url" >>"$ENVFILE"
fi

cat <<EOF

===========================================================
  ArkCare is public at:

    ${url}

  Written to Frontend/.env.local as NEXT_PUBLIC_APP_URL.
  RESTART the frontend (npm run dev / npm run build) for it to
  take effect - NEXT_PUBLIC_* is inlined at build time.

  Demo logins (password DemoOnly!123):
    patient          demo.patient@arkcare.local
    doctor           demo.doctor@arkcare.local
    hospital admin   demo.hospital_admin@arkcare.local
    platform admin   demo.platform_admin@arkcare.local

  The blockchain bridge stays on 127.0.0.1:${BRIDGE_PORT} and is NOT exposed.
  Stop the tunnel with:  ./scripts/start-ngrok.sh --stop
===========================================================

EOF
