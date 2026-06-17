#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PORT="${1:-5173}"
URL="http://127.0.0.1:${PORT}/"

python3 -m http.server "$PORT" --bind 127.0.0.1 &
SERVER_PID="$!"

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in {1..30}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if command -v google-chrome >/dev/null 2>&1; then
  google-chrome "$URL" >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
else
  printf 'Open %s in Chrome.\\n' "$URL"
fi

printf 'Zilch is running at %s\\n' "$URL"
printf 'Press Ctrl+C here to stop the server.\\n'
wait "$SERVER_PID"
