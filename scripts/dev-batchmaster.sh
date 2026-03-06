#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI_PORT="${BM_UI_PORT:-3000}"

cd "$ROOT_DIR"

npm --prefix server run dev &
SERVER_PID=$!

npm --prefix ui run dev &
UI_PID=$!

cleanup() {
  kill "$SERVER_PID" "$UI_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

until curl -sf "http://localhost:${UI_PORT}" >/dev/null 2>&1; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null || ! kill -0 "$UI_PID" 2>/dev/null; then
    wait "$SERVER_PID" "$UI_PID"
    exit 1
  fi

  sleep 1
done

open "http://localhost:${UI_PORT}"

wait "$SERVER_PID" "$UI_PID"
