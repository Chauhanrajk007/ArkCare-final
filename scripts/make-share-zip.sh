#!/usr/bin/env bash
# Create a shareable ArkCare zip that a friend can run with one command.
# Excludes machine-specific, regenerable artifacts (venvs, node_modules,
# .next, the local mongod binary and its data). Secrets ARE included so the
# demo works out of the box - see the warning below.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=scripts/lib-local.sh
source "$ROOT/scripts/lib-local.sh"
OUT="${1:-$ROOT/../ArkCare-share.zip}"

EXCLUDES=(
  './.runtime'
  './Backend/.venv'
  './Frontend/node_modules'
  './Frontend/.next'
  './Blockchain/node_modules'
  './Blockchain/runtime'
  './Blockchain/cache'
  './Blockchain/artifacts'
  './.git'
)

echo "Packaging ArkCare for sharing..."
echo "Output: $OUT"
echo

cd "$ROOT"

tar_excludes=()
for e in "${EXCLUDES[@]}"; do
  tar_excludes+=("--exclude=$e")
done

if command -v zip >/dev/null 2>&1; then
  zip -qr "$OUT" . \
    -x '.runtime/*' 'Backend/.venv/*' 'Frontend/node_modules/*' 'Frontend/.next/*' \
       'Blockchain/node_modules/*' 'Blockchain/runtime/*' 'Blockchain/cache/*' \
       'Blockchain/artifacts/*' '*.log' '.git/*'
  CMD_HINT="unzip $(basename "$OUT")"
else
  echo "NOTE: zip not installed; creating a .tar.gz instead (pacman -S zip for a .zip)"
  OUT="${OUT%.zip}"
  OUT="${OUT%.tar.gz}.tar.gz"
  tar czf "$OUT" "${tar_excludes[@]}" .
  CMD_HINT="tar xzf $(basename "$OUT")"
fi
echo

SIZE="$(du -h "$OUT" | cut -f1)"
echo "Done: $OUT ($SIZE)"
echo
cat <<MSG
Your friend runs:
    $CMD_HINT
    cd <extracted folder>
    ./scripts/start-local-all.sh

The first run downloads MongoDB (~100 MB), installs npm dependencies and
builds the Python 3.12 virtualenv, so allow 5-10 minutes.

WARNING: this archive contains real API credentials (Frontend/.env.local and
Backend/.env) so the demo runs without setup. Only share it with people you
trust, and rotate those keys if it is sent through a public channel.
MSG
