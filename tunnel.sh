#!/usr/bin/env bash
# Mulai Cloudflare quick tunnel ke web app di port 8000.
# URL publik akan tampil di log (trycloudflare.com)
set -e
BIN="$(dirname "$0")/.bin/cloudflared"
if [ ! -x "$BIN" ]; then
  echo "cloudflared tidak ditemukan. Install dulu:"
  echo "  curl -L -o .bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x .bin/cloudflared"
  exit 1
fi
PORT="${PORT:-8000}"
exec "$BIN" tunnel --url "http://localhost:${PORT}" --no-autoupdate