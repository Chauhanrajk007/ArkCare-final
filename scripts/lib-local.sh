#!/usr/bin/env bash
# Shared helpers for the ArkCare local launcher scripts (Linux).
# Sourced by start-local-all.sh / stop-local-all.sh / status-local-all.sh.

ARK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME="$ARK_ROOT/.runtime"
PID_DIR="$RUNTIME/pids"
LOG_DIR="$RUNTIME/logs"
MONGO_DIR="$RUNTIME/mongodb"
MONGO_BIN="$MONGO_DIR/bin/mongod"
MONGO_DATA="$MONGO_DIR/data"
MONGO_LOG="$MONGO_DIR/mongod.log"
MONGO_MARKER="$PID_DIR/mongod.launcher"
CHAIN_DIR="$ARK_ROOT/Blockchain"
FRONT_DIR="$ARK_ROOT/Frontend"
BACK_DIR="$ARK_ROOT/Backend"
VENV="$BACK_DIR/.venv"

export PATH="$HOME/.local/bin:$PATH"

# Ports / endpoints
# There is no local EVM: the blockchain is the MST public testnet, reached only
# through the bridge. The bridge itself stays on loopback and is never exposed.
MONGO_PORT=27017
API_PORT=8000
WEB_PORT=3000
BRIDGE_PORT=8546
MST_RPC_URL="https://testnetrpc.mstblockchain.com"
MONGO_URL="http://127.0.0.1:${MONGO_PORT}"
API_URL="http://127.0.0.1:${API_PORT}"
WEB_URL="http://localhost:${WEB_PORT}"
BRIDGE_URL="http://127.0.0.1:${BRIDGE_PORT}"

c_reset=$'\033[0m'; c_red=$'\033[31m'; c_green=$'\033[32m'
c_yellow=$'\033[33m'; c_blue=$'\033[36m'; c_bold=$'\033[1m'

info()  { printf '%s==>%s %s\n' "$c_blue" "$c_reset" "$*"; }
ok()    { printf '%s  OK%s  %s\n' "$c_green" "$c_reset" "$*"; }
warn()  { printf '%s  !!%s  %s\n' "$c_yellow" "$c_reset" "$*"; }
die()   { printf '%s ERR%s %s\n' "$c_red" "$c_reset" "$*" >&2; exit 1; }

ensure_dirs() { mkdir -p "$PID_DIR" "$LOG_DIR"; }

# --- port ownership -----------------------------------------------------
# Print the PIDs listening on a TCP port (does not kill anything).
port_pids() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnpH "sport = :${port}" 2>/dev/null |
      grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null | sort -u
  fi
}

port_in_use() { [ -n "$(port_pids "$1")" ]; }

# Human-readable description of what owns a port, without killing it.
describe_port_owner() {
  local port="$1" pid name
  pids="$(port_pids "$port")"
  [ -n "$pids" ] || { echo "free"; return; }
  pid="$(echo "$pids" | head -1)"
  if [ -r "/proc/$pid/cmdline" ]; then
    name="$(tr '\0' ' ' < "/proc/$pid/cmdline" | cut -c1-110)"
  else
    name="pid $pid"
  fi
  echo "$name"
}

# Fail loudly instead of killing a stranger's process.
assert_port_free() {
  local port="$1" label="$2" owner
  port_in_use "$port" || return 0
  owner="$(describe_port_owner "$port")"
  if port_owned_by_launcher "$port"; then
    return 0
  fi
  die "Port ${port} (${label}) is already in use by an unrelated process:
     ${owner}
  Refusing to kill it. Free the port or stop that service, then re-run."
}

# True if a PID file exists and the process behind a port was started by us.
port_owned_by_launcher() {
  local port="$1" pid cmd
  for pid in $(port_pids "$port"); do
    if [ -r "/proc/$pid/cmdline" ]; then
      cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline")"
      case "$cmd" in
        *"$ARK_ROOT"*|*"chatbotwithpdf:app"*|*"bridge-server.js"*|*"next dev"*|*"next-server"*)
          return 0 ;;
      esac
    fi
  done
  return 1
}

# --- pid file helpers ----------------------------------------------------
save_pid() { printf '%s\n' "$2" > "$PID_DIR/$1.pid"; }

pid_alive() {
  local f="$PID_DIR/$1.pid" pid
  [ -f "$f" ] || return 1
  pid="$(cat "$f" 2>/dev/null | head -1)"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null
}

clear_pid() { rm -f "$PID_DIR/$1.pid"; }

# --- health probes -------------------------------------------------------
http_ok() { curl -fsS --max-time "${2:-4}" -o /dev/null "$1" 2>/dev/null; }
http_code() {
  local code
  code="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null)" || code=""
  [ -n "$code" ] || code="000"
  printf '%s' "$code"
}

rpc_ok() {
  curl -fsS --max-time 8 -H 'Content-Type: application/json' \
    -X POST -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    "$MST_RPC_URL" 2>/dev/null | grep -q '"result"'
}

mongo_ok() {
  if [ -x "$MONGO_BIN" ]; then
    "$MONGO_BIN" --version >/dev/null 2>&1 || return 1
  fi
  if command -v mongosh >/dev/null 2>&1; then
    mongosh --quiet --eval 'db.runCommand({ping:1}).ok' "mongodb://127.0.0.1:${MONGO_PORT}/arkcare" 2>/dev/null | grep -q '^1$'
  else
    # No shell available: a listening socket plus an app that queries the DB is
    # the best available signal.
    port_in_use "$MONGO_PORT"
  fi
}

# Mongo is considered "ready" if our own mongod is up OR something else is
# serving the configured URI (e.g. Atlas).
mongo_ready() {
  if [ "$(awk -F= '/^MONGODB_URI=/{print $2}' "$FRONT_DIR/.env.local" 2>/dev/null | head -1)" \
       | grep -qE '127\.0\.0\.1|localhost' ]; then
    mongo_ok
  else
    ok "MONGODB_URI points at a remote cluster (not started locally)"
    return 0
  fi
}
