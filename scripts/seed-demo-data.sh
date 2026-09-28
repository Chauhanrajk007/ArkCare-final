#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Seeding ArkCare synthetic demo data..."
echo "This uses the existing MONGODB_URI from your local ArkCare environment."
echo

cd "$ROOT/Frontend"

if [[ ! -d node_modules ]]; then
  npm install
fi

npm run seed:demo

echo
echo "Done."
echo "Use the one-click Demo Patient / Demo Doctor / Demo Nurse / Demo Hospital Admin buttons."
