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

node "$ROOT_DIR/node_modules/9router/cli.js" \
  --no-browser \
  --skip-update \
  --log \
  --host 0.0.0.0 \
  --port "${PORT:-20128}" &
ROUTER_PID=$!

# Reconnect the persisted public tunnel after a workflow restart. The API
# call may time out while Cloudflare finishes its health check, but 9Router
# still starts the tunnel process; the local server remains available.
(
  for _ in {1..30}; do
    if curl -fsS --max-time 2 "http://127.0.0.1:${PORT:-20128}/api/health" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if [ -r "$HOME/.9router/machine-id" ] && [ -r "$HOME/.9router/auth/cli-secret" ]; then
    CLI_TOKEN="$(node -e '
      const fs = require("node:fs");
      const crypto = require("node:crypto");
      const d = `${process.env.HOME}/.9router`;
      const machine = fs.readFileSync(`${d}/machine-id`, "utf8").trim();
      const secret = fs.readFileSync(`${d}/auth/cli-secret`, "utf8").trim();
      process.stdout.write(crypto.createHash("sha256").update(machine + "9r-cli-auth" + secret).digest("hex").slice(0, 16));
    ')"
    TUNNEL_STATUS="$(curl -fsS --max-time 10 \
      -H "x-9r-cli-token: ${CLI_TOKEN}" \
      "http://127.0.0.1:${PORT:-20128}/api/tunnel/status" 2>/dev/null || true)"
    if ! grep -q '"running":true' <<<"$TUNNEL_STATUS"; then
      curl -sS --max-time 75 -X POST \
        -H "x-9r-cli-token: ${CLI_TOKEN}" \
        "http://127.0.0.1:${PORT:-20128}/api/tunnel/enable" >/dev/null 2>&1 || true
    fi
  fi
) &

wait "$ROUTER_PID"