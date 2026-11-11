#!/usr/bin/env bash
# backend/scripts/deploy.sh
#
# Shared-hosting / bare-metal deploy path — builds both apps, then restarts via
# the hosting panel's Node.js app mechanism (no Docker, no PM2).
#
# Order matters and is deliberate:
#   1. Install deps + build BOTH frontend and backend before touching anything live —
#      a broken build must never take down the currently-running app.
#   2. Run pending migrations BEFORE starting new code that may depend on schema/index
#      changes already being in place (see src/scripts/migrate.ts's own comment on why
#      this is a separate explicit step, never run automatically on boot).
#   3. Only then (re)start the app.
#
# Usage: ./scripts/deploy.sh   (run from the backend/ directory)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"

echo "==> Installing backend dependencies"
cd "$BACKEND_DIR"
npm ci

echo "==> Installing frontend dependencies"
cd "$FRONTEND_DIR"
npm ci

echo "==> Building frontend"
npm run build

echo "==> Copying frontend build into backend/client"
# server.ts serves the built frontend from path.join(__dirname, "../client") —
# __dirname is backend/dist at runtime, so this must land at backend/client.
rm -rf "$BACKEND_DIR/client"
cp -r "$FRONTEND_DIR/dist" "$BACKEND_DIR/client"

echo "==> Building backend"
cd "$BACKEND_DIR"
npx tsc

echo "==> Running pending database migrations"
npm run migrate

echo "==> Restarting the app"
# Most shared-hosting Node.js app panels (cPanel's "Setup Node.js App", and other
# Phusion Passenger-based hosts) restart the app when a file at app_root/tmp/restart.txt
# is touched — this is the standard Passenger convention, not something this script can
# reliably do for you across every host. Check your specific host's Node.js app docs for
# its exact restart mechanism (some also expose a manual "Restart" button in the panel).
if [ -d "$BACKEND_DIR/tmp" ] || mkdir -p "$BACKEND_DIR/tmp" 2>/dev/null; then
  touch "$BACKEND_DIR/tmp/restart.txt"
  echo "Touched tmp/restart.txt (Passenger restart convention) — if your host uses a"
  echo "different mechanism, restart the app manually via its panel."
else
  echo "Could not create tmp/restart.txt — restart the app manually via your host's panel."
fi

echo "==> Deploy complete"
