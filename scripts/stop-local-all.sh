#!/usr/bin/env bash
# ArkCare - stop ONLY the processes this launcher started (stored PID files).
# System services, Docker containers and unrelated programs are never touched.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib-local.sh
source "$SCRIPT_DIR/lib-local.sh"

ensure_dirs

# Refuse to signal a PID that is not actually our process (stale/recycled PID).
verify_cmdline() {
  local pid="$1"
  [ -r "/proc/$pid/cmdline" ] || return 1
  tr '\0' ' ' < "/proc/$pid/cmdline"
}

# Ports owned by each service, used only to reap stragglers after the group kill.
port_pids_for() {
  case "$1" in
    frontend) port_pids "$WEB_PORT" ;;
    backend)  port_pids "$API_PORT" ;;
    bridge)   port_pids "$BRIDGE_PORT" ;;
    *)        echo "" ;;
  esac
}

stop_service() {
  local name="$1" pattern="$2" pid sig
  if ! pid_alive "$name"; then
    printf '  %-10s not running\n' "$name"
    clear_pid "$name"
    return 0
  fi
  pid="$(cat "$PID_DIR/$name.pid" | head -1)"
  if ! verify_cmdline "$pid" | grep -qF -- "$pattern"; then
    warn "PID $pid for $name no longer matches '$pattern'; leaving it alone"
    clear_pid "$name"
    return 0
  fi
  # The launcher starts each service in its own session (setsid), so the
  # recorded PID is also the process-group leader. Signalling the group
  # guarantees child processes (e.g. the Next.js turbopack workers) go away too.
  kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.5
  done
  if kill -0 "$pid" 2>/dev/null; then
    warn "$name (pid $pid) did not exit on SIGTERM; sending SIGKILL"
    kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
    sleep 1
  fi
  # Reap anything that survived the group signal.
  for p in $(port_pids_for "$name"); do
    if verify_cmdline "$p" | grep -qF -- "$pattern"; then
      kill -KILL "$p" 2>/dev/null || true
    fi
  done
  ok "stopped $name (pid $pid)"
  clear_pid "$name"
}

printf '%s%sStopping ArkCare local services%s\n' "$c_bold" "$c_blue" "$c_reset"

stop_service frontend "next"
stop_service backend  "chatbotwithpdf:app"
stop_service bridge   "bridge-server.js"

# MongoDB: only if THIS launcher started it. The mongod binary was installed by
# a one-time manual setup, not by the launcher, so by default we leave a
# persistent MongoDB running. Export ARKCARE_STOP_MONGO=1 to stop it.
if [ "${ARKCARE_STOP_MONGO:-0}" = "1" ]; then
  if [ -f "$MONGO_MARKER" ] || pgrep -x mongod >/dev/null 2>&1; then
    # Only ever signal a mongod whose executable is the copy inside this
    # repository's .runtime/mongodb/bin. A system mongod is never touched.
    for p in $(pgrep -x mongod 2>/dev/null || true); do
      exe="$(readlink -f "/proc/$p/exe" 2>/dev/null || true)"
      [ "$exe" = "$(readlink -f "$MONGO_BIN")" ] || continue
      kill -TERM "$p" 2>/dev/null
      ok "stopped mongod (pid $p)"
    done
    rm -f "$MONGO_MARKER"
  else
    warn "MongoDB was not started by the launcher; leaving it running"
  fi
else
  info "Leaving MongoDB running (persistent). Set ARKCARE_STOP_MONGO=1 to stop it."
fi

printf '\n'
exec "$SCRIPT_DIR/status-local-all.sh"
