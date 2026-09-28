#!/usr/bin/env bash
# serve-phone.sh — expose the local ArkCare frontend to a phone over HTTPS.
#
# Why HTTPS? Browsers block microphone/camera (getUserMedia) on plain
# http://<LAN-IP>. The app itself refuses to start video calls from an
# insecure context. A cloudflared quick tunnel gives a public HTTPS URL with a
# real certificate, so video calls and image upload work from a phone on the
# same Wi-Fi or on any network with internet access.
#
# Usage:
#   ./scripts/serve-phone.sh            start tunnel, print the HTTPS URL
#   ./scripts/serve-phone.sh --stop     stop the tunnel only
#   ./scripts/serve-phone.sh --status   show current tunnel URL/status
#
# Notes:
# - The URL is random and changes on every start.
# - Requires outbound 443 to api.cloudflare.com (uses HTTP/2, no account).
# - The tunnel binary is cached in /tmp/opencode/cloudflared.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLOUDFLARED="/tmp/opencode/cloudflared"
LOG="/tmp/opencode/cloudflared.log"
PIDFILE="/tmp/opencode/cloudflared.pid"

tunnel_pid() {
  if [[ -f "$PIDFILE" ]]; then
    local pid
    pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return 0
    fi
  fi
  # Match any cloudflared tunnel pointed at our frontend, regardless of the
  # transport flags used (e.g. --protocol http2).
  pgrep -f "cloudflared tunnel .*localhost:3000" | head -1 || true
}

tunnel_url() {
  grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1 || true
}

case "${1:-start}" in
  --stop|-s)
    pid="$(tunnel_pid)"
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
    # The tunnel runs via setsid, so the cloudflared process is its own session
    # leader and survives killing only the recorded wrapper PID. Reap it by
    # pattern so --stop/--start cycles don't leave a stale tunnel behind.
    pkill -f "cloudflared tunnel .*localhost:3000" 2>/dev/null || true
    sleep 1
    echo "Tunnel stopped."
    ;;
  --status|-S)
    pid="$(tunnel_pid)"
    url="$(tunnel_url)"
    if [[ -n "$pid" ]] && [[ -n "$url" ]]; then
      echo "RUNNING pid=$pid"
      echo "URL: $url"
      echo "Test: curl -sI $url | head -1"
    else
      echo "Not running."
    fi
    ;;
  start|*)
    # Ensure the local frontend is actually up before wiring a tunnel to it.
    if ! curl -s -o /dev/null --max-time 3 http://localhost:3000; then
      echo "Frontend on :3000 is not responding. Start it first with ./scripts/start-local-all.sh" >&2
      exit 1
    fi

    pid="$(tunnel_pid)"
    if [[ -n "$pid" ]]; then
      echo "Tunnel already running (pid $pid)."
    else
      if [[ -x "$CLOUDFLARED" ]]; then
        :
      else
        echo "Downloading cloudflared..." >&2
        mkdir -p "$(dirname "$CLOUDFLARED")"
        curl -fsSL \
          https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
          -o "$CLOUDFLARED"
        chmod +x "$CLOUDFLARED"
      fi
      # HTTP/2 over TCP + forced IPv4: this network blocks QUIC/UDP and drops
      # IPv6 edge connections, so QUIC/UDP6 tunnels fail to stay registered.
      setsid nohup "$CLOUDFLARED" tunnel \
        --protocol http2 --edge-ip-version 4 --no-autoupdate \
        --url http://localhost:3000 >"$LOG" 2>&1 < /dev/null &
      echo $! > "$PIDFILE"
      echo "Tunnel starting..." >&2
    fi

    # Quick tunnels take ~10s to register at the Cloudflare edge.
    for _ in $(seq 1 25); do
      url="$(tunnel_url)"
      [[ -n "$url" ]] && break
      sleep 1
    done

    if [[ -z "$url" ]]; then
      echo "Tunnel did not register. Check $LOG" >&2
      exit 1
    fi

    # A URL is assigned before the edge connection is usable. Wait until the
    # public URL actually serves the app, otherwise a flaky edge shows a 530.
    ready=0
    for _ in $(seq 1 20); do
      if curl -s -o /dev/null --max-time 8 "$url/sign-in"; then
        ready=1
        break
      fi
      sleep 2
    done
    if [[ "$ready" -ne 1 ]]; then
      echo "WARNING: $url is not serving yet (edge connection unstable)."
      echo "Re-run './scripts/serve-phone.sh --stop' then start again in a moment."
      echo "For browsing without camera, use http://$(hostname -I 2>/dev/null | awk '{print $1}'):3000"
    fi

    echo ""
    echo "=============================================================="
    echo "  PHONE URL (HTTPS, camera/mic will work):"
    echo "    $url"
    echo "=============================================================="
    echo ""
    echo "Open that URL in the phone browser and sign in as:"
    echo "  Patient: demo.patient@arkcare.local / DemoOnly!123"
    echo ""
    echo "On another device (or this PC) sign in as the doctor at"
    echo "http://localhost:3000 with:"
    echo "  Doctor:  demo.doctor@arkcare.local / DemoOnly!123"
    echo ""
    echo "Both sides: My Appointments -> open the 'SYNTHETIC DEMO' appointment"
    echo "-> Chat. The doctor can file a consultation report from the Report button"
    echo "in the chat header; the patient's CareQuest page updates with the report,"
    echo "prescription, daily activities and a 4-question knowledge check."
    echo ""
    echo "Note: this network blocks QUIC/UDP, so the tunnel uses HTTP/2 over TCP."
    echo "If a URL stops resolving, run --stop then start again for a fresh one."
    echo ""
    echo "Stop with: ./scripts/serve-phone.sh --stop"
    ;;
esac