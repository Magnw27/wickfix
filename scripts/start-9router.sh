#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_NODE_MODULES="${DATA_DIR:-$HOME/.9router}/runtime/node_modules"

# 9Router keeps its runtime dependencies outside the project. Reuse the
# project-installed native driver so login/database access works reliably
# after restarts, even when the package firewall blocks a runtime install.
mkdir -p "$RUNTIME_NODE_MODULES"
if [ -d "$ROOT_DIR/node_modules/better-sqlite3" ]; then
  ln -sfn "$ROOT_DIR/node_modules/better-sqlite3" "$RUNTIME_NODE_MODULES/better-sqlite3"
fi

if [ -n "${REPLIT_DEV_DOMAIN:-}" ]; then
  printf 'Public URL: https://%s (port 20128)\n' "$REPLIT_DEV_DOMAIN"
fi

exec node "$ROOT_DIR/node_modules/9router/cli.js" \
  --no-browser \
  --skip-update \
  --log \
  --host 0.0.0.0 \
  --port "${PORT:-20128}"