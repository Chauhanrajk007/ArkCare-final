#!/usr/bin/env bash
# ArkCare - one-command local environment starter (Linux).
# Starts: MongoDB, CareQuest bridge (MST testnet), FastAPI backend, Next.js.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib-local.sh
source "$SCRIPT_DIR/lib-local.sh"

ensure_dirs

# --------------------------------------------------------------- preflight
printf '%s%sARKCARE LOCAL ENVIRONMENT%s\n' "$c_bold" "$c_blue" "$c_reset"
info "Repository root: $ARK_ROOT"

missing=()
for cmd in node npm curl; do
  command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
done
if [ ${#missing[@]} -gt 0 ]; then
  die "Missing required command(s): ${missing[*]}
  Install Node.js 20+ (LTS) and re-run."
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node $(node --version) is too old for Next.js 15. Install Node 20+ LTS."
fi
ok "Node $(node --version), npm $(npm --version)"

# Python 3.11/3.12 selection (backend requires >=3.11,<3.13)
pick_python() {
  for c in python3.12 python3.11; do
    if command -v "$c" >/dev/null 2>&1; then command -v "$c"; return 0; fi
  done
  for c in python3.13 python3.14 python3; do
    if command -v "$c" >/dev/null 2>&1; then command -v "$c"; return 0; fi
  done
  return 1
}

# ------------------------------------------------------------ frontend env
if [ ! -f "$FRONT_DIR/.env.local" ]; then
  if [ -f "$FRONT_DIR/.env.local.example" ]; then
    cp "$FRONT_DIR/.env.local.example" "$FRONT_DIR/.env.local"
    chmod 600 "$FRONT_DIR/.env.local"
    ok "Created Frontend/.env.local from example (fill secrets before real use)"
  else
    die "Frontend/.env.local is missing and no example exists."
  fi
else
  ok "Frontend/.env.local present"
fi

for f in "$FRONT_DIR/.env.local"; do
  chmod 600 "$f" 2>/dev/null || true
done

# Report (never print) required-but-empty credentials.
report_missing_credentials() {
  local missing_vars=()
  while IFS='=' read -r k v; do
    case "$k" in
      AUTH_SECRET|GROQ_API_KEY|PUSHER_APP_ID|PUSHER_KEY|PUSHER_SECRET|PUSHER_CLUSTER|NEXT_PUBLIC_PUSHER_KEY|NEXT_PUBLIC_PUSHER_CLUSTER|RAZORPAY_KEY_ID|RAZORPAY_KEY_SECRET|CLOUDINARY_CLOUD_NAME|CLOUDINARY_API_KEY|CLOUDINARY_API_SECRET|AGORA_APP_ID|AGORA_APP_CERTIFICATE)
        [ -z "$v" ] && missing_vars+=("$k") ;;
    esac
  done < "$FRONT_DIR/.env.local"
  if [ ${#missing_vars[@]} -gt 0 ]; then
    warn "Credential(s) absent (integrations will be disabled, app still starts): ${missing_vars[*]}"
  fi
}
report_missing_credentials

# ------------------------------------------------------------------- mongo
# Download a MongoDB server binary into .runtime/mongodb when the folder was
# copied without one, or the bundled binary will not run (e.g. different libc).
MONGO_VERSION=8.0.4
mongo_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo x86_64 ;;
    aarch64|arm64) echo aarch64 ;;
    *) echo "" ;;
  esac
}
mongo_distro() {
  # The ubuntu2204 build works on glibc systems (Debian/Ubuntu/Arch/Fedora).
  if [ -r /etc/os-release ]; then
    . /etc/os-release
    case "${ID:-}${ID_LIKE:-}" in
      *alpine*|*musl*) echo musl ;;
      *) echo glibc ;;
    esac
  else
    echo glibc
  fi
}
install_mongo_binary() {
  local arch dist url tmp
  arch="$(mongo_arch)"; dist="$(mongo_distro)"
  if [ -z "$arch" ] || [ "$dist" = "musl" ]; then
    warn "No prebuilt mongod for ${arch:-$(uname -m)}/${dist}"
    return 1
  fi
  if ! command -v curl >/dev/null 2>&1; then return 1; fi
  info "Downloading MongoDB ${MONGO_VERSION} (~100 MB, one time)"
  tmp="$RUNTIME/.mongo-download"
  rm -rf "$tmp"; mkdir -p "$tmp"
  if [ "$dist" = "glibc" ]; then
    url="https://fastdl.mongodb.org/linux/mongodb-linux-${arch}-ubuntu2204-${MONGO_VERSION}.tgz"
  else
    return 1
  fi
  if ! curl -fsSL "$url" -o "$tmp/mongo.tgz"; then
    rm -rf "$tmp"; warn "Download failed: $url"; return 1
  fi
  tar xzf "$tmp/mongo.tgz" -C "$tmp" || { rm -rf "$tmp"; return 1; }
  mkdir -p "$MONGO_DIR/bin"
  cp "$tmp"/mongodb-linux-*/bin/mongod "$MONGO_BIN" || { rm -rf "$tmp"; return 1; }
  chmod +x "$MONGO_BIN"
  rm -rf "$tmp"
  "$MONGO_BIN" --version >/dev/null 2>&1 || { warn "Downloaded mongod will not run here"; return 1; }
  ok "MongoDB binary ready (.runtime/mongodb/bin/mongod)"
}

start_mongo() {
  local uri_local
  uri_local="$(awk -F= '/^MONGODB_URI=/{print $2}' "$FRONT_DIR/.env.local" 2>/dev/null | head -1)"
  if ! printf '%s' "$uri_local" | grep -qE '127\.0\.0\.1|localhost'; then
    ok "MONGODB_URI uses a remote cluster; skipping local MongoDB"
    return 0
  fi
  if mongo_ok; then
    ok "MongoDB already listening on ${MONGO_PORT}"
    return 0
  fi
  if [ ! -x "$MONGO_BIN" ] || ! "$MONGO_BIN" --version >/dev/null 2>&1; then
    # No usable local mongod: try a system install, then Docker, then download.
    if command -v mongod >/dev/null 2>&1; then
      MONGO_BIN="$(command -v mongod)"
      warn "Using system mongod at $MONGO_BIN"
    elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
      info "Starting MongoDB via Docker (container: arkcare-mongo)"
      if docker ps -a --format '{{.Names}}' | grep -qx arkcare-mongo; then
        docker start arkcare-mongo >/dev/null || die "Could not start container arkcare-mongo"
      else
        docker run -d --name arkcare-mongo --restart unless-stopped \
          -p "${MONGO_PORT}:${MONGO_PORT}" -v arkcare_mongo_data:/data/db mongo:7 >/dev/null \
          || die "Could not start the arkcare-mongo container"
      fi
      for _ in $(seq 1 40); do mongo_ok && break; sleep 1; done
      mongo_ok || die "Docker MongoDB did not become ready"
      ok "MongoDB running via Docker on 127.0.0.1:${MONGO_PORT}"
      return 0
    else
      install_mongo_binary || die "Could not provide a local MongoDB.
  Install MongoDB (system package or Docker), or set MONGODB_URI to a reachable
  server, then re-run."
    fi
  fi
  assert_port_free "$MONGO_PORT" "MongoDB"
  mkdir -p "$MONGO_DATA"
  info "Starting mongod (data: .runtime/mongodb/data)"
  "$MONGO_BIN" --dbpath "$MONGO_DATA" --bind_ip 127.0.0.1 --port "$MONGO_PORT" \
    --logpath "$MONGO_LOG" --fork >/dev/null
  pgrep -f "mongod --dbpath ${MONGO_DATA}" | head -1 > "$MONGO_MARKER"
  for _ in $(seq 1 30); do
    mongo_ok && break
    sleep 1
  done
  mongo_ok || die "MongoDB did not become ready. See $MONGO_LOG"
  ok "MongoDB running on 127.0.0.1:${MONGO_PORT} (db: arkcare)"
}

# ---------------------------------------------------------------- frontend
start_frontend() {
  # A copied/moved folder keeps a working node_modules, but reinstall if the
  # tree is missing or its binaries were built for another platform.
  if [ ! -d "$FRONT_DIR/node_modules" ] || [ ! -d "$FRONT_DIR/node_modules/next" ]; then
    info "Installing Frontend dependencies (npm ci)..."
    ( cd "$FRONT_DIR" && npm ci >"$LOG_DIR/frontend-install.log" 2>&1 ) \
      || { tail -20 "$LOG_DIR/frontend-install.log"; die "npm ci failed"; }
  fi
  ok "Frontend dependencies present"
}

# --------------------------------------------------------------- blockchain
start_blockchain() {
  if [ ! -d "$CHAIN_DIR/node_modules/ethers" ]; then
    info "Installing Blockchain dependencies (npm install)..."
    ( cd "$CHAIN_DIR" && npm install >"$LOG_DIR/blockchain-install.log" 2>&1 ) \
      || { tail -20 "$LOG_DIR/blockchain-install.log"; die "npm install failed for Blockchain"; }
  fi
  ok "Blockchain dependencies present"
}

# ------------------------------------------------------------------ backend
start_backend_env() {
  PY_BIN="$(pick_python)" || die "No python3 interpreter found."
  PY_VER="$("$PY_BIN" -c 'import sys;print("%d.%d"%sys.version_info[:2])')"
  if [ "$PY_VER" != "3.11" ] && [ "$PY_VER" != "3.12" ]; then
    if command -v uv >/dev/null 2>&1; then
      warn "System Python is $PY_VER; provisioning Python 3.12 with uv"
      uv python install 3.12 >"$LOG_DIR/uv-python.log" 2>&1 || true
      PY_BIN="$(uv python find 3.12 2>/dev/null || echo "$PY_BIN")"
    else
      die "Backend requires Python 3.11 or 3.12, found $PY_VER.
  Install python3.12 (or 'uv python install 3.12') and re-run."
    fi
  fi
  ok "Backend Python: $PY_BIN ($("$PY_BIN" -c 'import sys;print("%d.%d"%sys.version_info[:2])'))"

  # A venv copied from another machine or another folder is broken: it records
  # absolute paths to the original interpreter. Detect that and rebuild it.
  local venv_broken=0
  if [ -x "$VENV/bin/python" ]; then
    if ! "$VENV/bin/python" -c 'import sys' >/dev/null 2>&1; then
      venv_broken=1
      warn "Backend/.venv was built elsewhere or moved; rebuilding it"
    elif [ -f "$VENV/pyvenv.cfg" ] && grep -qE "^home = /" "$VENV/pyvenv.cfg" \
         && [ ! -d "$(awk -F' = ' '/^home = /{print $2}' "$VENV/pyvenv.cfg" | tr -d '\r')" ]; then
      venv_broken=1
      warn "Backend/.venv points at a missing interpreter path; rebuilding it"
    fi
  else
    venv_broken=1
  fi

  if [ "$venv_broken" = "1" ]; then
    info "Creating Backend virtualenv (.venv)"
    rm -rf "$VENV"
    if command -v uv >/dev/null 2>&1; then
      ( cd "$BACK_DIR" && uv venv --python 3.12 .venv >"$LOG_DIR/venv.log" 2>&1 ) \
        || { tail -5 "$LOG_DIR/venv.log"; die "venv creation failed"; }
    else
      ( cd "$BACK_DIR" && "$PY_BIN" -m venv .venv ) || die "venv creation failed"
    fi
  fi

  "$VENV/bin/python" -c 'import uvicorn, fastapi' >/dev/null 2>&1 || {
    info "Installing Backend Python dependencies..."
    if command -v uv >/dev/null 2>&1; then
      ( cd "$BACK_DIR" && VIRTUAL_ENV="$VENV" uv pip install -r requirements.txt >"$LOG_DIR/pip-install.log" 2>&1 )
    else
      "$VENV/bin/python" -m pip install --upgrade pip >/dev/null 2>&1 || true
      ( cd "$BACK_DIR" && "$VENV/bin/python" -m pip install -r requirements.txt >"$LOG_DIR/pip-install.log" 2>&1 )
    fi
    tail -5 "$LOG_DIR/pip-install.log"
  }
  ok "Backend dependencies ready"
}

wait_for() {
  local url="$1" label="$2" tries="${3:-90}"
  for _ in $(seq 1 "$tries"); do
    if http_ok "$url"; then return 0; fi
    sleep 1
  done
  return 1
}

# spawn <name> <workdir> <cmd...>
# Starts a detached service and records the PID of the real process (not a
# wrapper shell) in .runtime/pids/<name>.pid, so the stop script can safely
# verify the process identity before signalling it.
spawn() {
  local name="$1" workdir="$2"; shift 2
  ( cd "$workdir" && exec nohup setsid "$@" >>"$LOG_DIR/$name.log" 2>&1 ) &
  local pid=$!
  printf '%s\n' "$pid" > "$PID_DIR/$name.pid"
  disown "$pid" 2>/dev/null || true
}

# =================================================================== start
start_mongo
start_frontend
start_blockchain
start_backend_env

# --- MST testnet reachability + deployment record ------------------------
# There is no local chain. The bridge reads Blockchain/runtime/deployment.json
# for the live contract addresses, so that file has to exist before it starts.
if rpc_ok; then
  ok "MST testnet RPC reachable (${MST_RPC_URL})"
else
  warn "MST testnet RPC not reachable (${MST_RPC_URL})"
  warn "The bridge and the app will start, but on-chain writes will fail."
fi

if [ -f "$CHAIN_DIR/runtime/deployment.json" ]; then
  ok "Contract deployment record present"
else
  die "Blockchain/runtime/deployment.json is missing.
    Deploy the CareQuest contracts to MST testnet first:
        cd Blockchain && npm run deploy:mst
    (needs BRIDGEKEY_PRIVATE_KEY in ../arkcare.env and funded testnet tokens)"
fi

if grep -qE '^BRIDGEKEY_PRIVATE_KEY=.+' "$ARK_ROOT/arkcare.env" 2>/dev/null; then
  ok "BRIDGEKEY_PRIVATE_KEY present in arkcare.env"
else
  die "BRIDGEKEY_PRIVATE_KEY is not set in $ARK_ROOT/arkcare.env.
    The bridge is the only process that can sign for the deployed contracts,
    so it cannot start without that key. Request the file from the repo owner."
fi

# --- blockchain bridge ---------------------------------------------------
if http_ok "$BRIDGE_URL/health"; then
  ok "CareQuest bridge already running on ${BRIDGE_PORT}"
else
  assert_port_free "$BRIDGE_PORT" "CareQuest bridge"
  info "Starting CareQuest bridge on 127.0.0.1:${BRIDGE_PORT}"
  spawn bridge "$CHAIN_DIR" node bridge-server.js
  wait_for "$BRIDGE_URL/health" "bridge" 30 \
    || { tail -20 "$LOG_DIR/bridge.log"; die "CareQuest bridge did not become ready"; }
  ok "CareQuest bridge ready"
fi

# --- FastAPI backend -----------------------------------------------------
if http_ok "$API_URL/health"; then
  ok "FastAPI already running on ${API_PORT}"
else
  assert_port_free "$API_PORT" "FastAPI"
  info "Starting FastAPI backend on 127.0.0.1:${API_PORT}"
  spawn backend "$BACK_DIR" "$VENV/bin/python" -m uvicorn chatbotwithpdf:app \
    --host 127.0.0.1 --port "$API_PORT"
  wait_for "$API_URL/health" "backend" 120 \
    || { tail -25 "$LOG_DIR/backend.log"; die "FastAPI did not become healthy"; }
  ok "FastAPI healthy"
fi

# --- Next.js frontend ----------------------------------------------------
if [ "$(http_code "$WEB_URL")" != "000" ]; then
  ok "Next.js already serving on ${WEB_PORT}"
else
  assert_port_free "$WEB_PORT" "Next.js"
  info "Starting Next.js on ${WEB_PORT}"
  # Run the Next binary directly (not via `npm run`) so the recorded PID is the
  # actual server process rather than an npm wrapper.
  spawn frontend "$FRONT_DIR" "$FRONT_DIR/node_modules/.bin/next" dev --turbopack
  for _ in $(seq 1 120); do
    [ "$(http_code "$WEB_URL")" != "000" ] && break
    sleep 1
  done
  [ "$(http_code "$WEB_URL")" != "000" ] \
    || { tail -25 "$LOG_DIR/frontend.log"; die "Next.js did not become ready"; }
  ok "Next.js ready"
fi

# --- summary -------------------------------------------------------------
exec "$SCRIPT_DIR/status-local-all.sh"
