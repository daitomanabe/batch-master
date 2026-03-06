#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${BM_PORT:-3310}"

cd "$ROOT_DIR"

npm run build

node server/dist/index.js &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

until curl -sf "http://localhost:${PORT}/api/bootstrap" >/dev/null 2>&1; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    wait "$SERVER_PID"
    exit 1
  fi

  sleep 1
done

open "http://localhost:${PORT}"

wait "$SERVER_PID"
