#!/usr/bin/env bash
# ArkCare - status of the local environment (real health checks, not just PIDs).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib-local.sh
source "$SCRIPT_DIR/lib-local.sh"

# Print "<label>|<state>" rows, aligned later.
state_of() {
  case "$1" in
    RUNNING) printf '%sRUNNING%s' "$c_green"  "$c_reset" ;;
    WARN)    printf '%sWARN%s'    "$c_yellow" "$c_reset" ;;
    *)       printf '%sSTOPPED%s' "$c_red"    "$c_reset" ;;
  esac
}

# --- MongoDB -------------------------------------------------------------
mongo_uri="$(awk -F= '/^MONGODB_URI=/{print $2}' "$FRONT_DIR/.env.local" 2>/dev/null | head -1)"
mongo_is_local=0
case "$mongo_uri" in *127.0.0.1*|*localhost*) mongo_is_local=1 ;; esac

mongo_state=STOPPED
mongo_note=""
if [ "$mongo_is_local" = "0" ]; then
  mongo_state=WARN
  mongo_note="MONGODB_URI points at a remote cluster (not started locally)"
elif mongo_ok; then
  mongo_state=RUNNING
  mongo_note="127.0.0.1:${MONGO_PORT} (db: arkcare)"
else
  mongo_note="not running - start with ./scripts/start-local-all.sh"
fi

api_state=STOPPED; api_note="http://127.0.0.1:${API_PORT}"
if http_ok "$API_URL/health"; then api_state=RUNNING; api_note="$API_URL/health OK"; fi

web_state=STOPPED; web_note="http://localhost:${WEB_PORT}"
wc="$(http_code "$WEB_URL")"
if [ "$wc" != "000" ]; then
  web_state=RUNNING
  web_note="HTTP ${wc} on :${WEB_PORT}"
elif [ -n "$(port_pids "$WEB_PORT")" ]; then
  web_note="port ${WEB_PORT} in use but not answering HTTP"
fi

rpc_state=STOPPED; rpc_note="${MST_RPC_URL}"
if rpc_ok; then
  rpc_state=RUNNING
  bn="$(curl -fsS --max-time 8 -H 'Content-Type: application/json' -X POST \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' "$MST_RPC_URL" 2>/dev/null | grep -oE '"result":"0x[0-9a-fA-F]+"' | cut -d'"' -f4)"
  rpc_note="rpc ok ${bn:+(block ${bn})}"
fi

bridge_state=STOPPED; bridge_note="http://127.0.0.1:${BRIDGE_PORT}"
if http_ok "$BRIDGE_URL/health"; then bridge_state=RUNNING; bridge_note="$BRIDGE_URL/health OK"; fi

# --- render --------------------------------------------------------------
printf '%s%sSERVICE STATUS%s\n' "$c_bold" "$c_blue" "$c_reset"
printf '%-22s %-9s %s\n' "SERVICE" "STATE" "DETAIL"
printf '%-22s %-9s %s\n' "MongoDB"             "$(state_of $mongo_state)"  "$mongo_note"
printf '%-22s %-9s %s\n' "FastAPI :${API_PORT}"      "$(state_of $api_state)"    "$api_note"
printf '%-22s %-9s %s\n' "Next.js :${WEB_PORT}"      "$(state_of $web_state)"    "$web_note"
printf '%-22s %-9s %s\n' "MST testnet RPC"     "$(state_of $rpc_state)"    "$rpc_note"
printf '%-22s %-9s %s\n' "Blockchain :${BRIDGE_PORT}" "$(state_of $bridge_state)" "$bridge_note"

printf '\n%sPID files%s\n' "$c_bold" "$c_reset"
for svc in mongod bridge backend frontend; do
  if [ "$svc" = "mongod" ] && ! pid_alive "$svc"; then
    mp="$(pgrep -f "mongod --dbpath" 2>/dev/null | head -1 || true)"
    if [ -n "$mp" ]; then
      printf '  %-10s pid %s (running, persistent)\n' "$svc" "$mp"
    else
      printf '  %-10s %s\n' "$svc" "not running"
    fi
    continue
  fi
  if [ "$svc" = "frontend" ] && ! pid_alive "$svc"; then
    fp="$(port_pids "$WEB_PORT" | head -1 || true)"
    if [ -n "$fp" ]; then
      printf '  %-10s pid %s (running on :%s)\n' "$svc" "$fp" "$WEB_PORT"
    else
      printf '  %-10s %s\n' "$svc" "not running"
    fi
    continue
  fi
  if pid_alive "$svc"; then
    printf '  %-10s pid %s (running)\n' "$svc" "$(cat "$PID_DIR/$svc.pid" | head -1)"
  else
    printf '  %-10s %s\n' "$svc" "not managed by launcher / not running"
  fi
done
printf '\nLogs: %s\n' "$LOG_DIR"
