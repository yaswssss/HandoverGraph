#!/bin/zsh
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT/backend"
if [ ! -x .venv/bin/uvicorn ]; then
  python3 -m venv .venv
  .venv/bin/python -m pip install -r requirements.txt
fi

cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  npm install
fi

cd "$ROOT"
./backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
API_PID=$!
(cd frontend && npm run dev -- --host 127.0.0.1) &
WEB_PID=$!
cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
sleep 2
open "http://localhost:5173"
wait
