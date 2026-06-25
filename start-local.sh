#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

site_port="${SITE_PORT:-4173}"
worker_port="${WORKER_PORT:-8788}"
site_url="http://127.0.0.1:${site_port}/?preview=store"
worker_url="http://127.0.0.1:${worker_port}"
pids=()

cleanup() {
    for pid in "${pids[@]}"; do
        if kill -0 "$pid" >/dev/null 2>&1; then
            kill "$pid" >/dev/null 2>&1 || true
        fi
    done
}

trap cleanup EXIT INT TERM

echo "Maryilu local store: ${site_url}"
echo "Maryilu local Worker: ${worker_url}"
echo ""
echo "Starting the static site and Worker together..."

python3 -m http.server "$site_port" --bind 127.0.0.1 &
pids+=("$!")

npx wrangler dev --local --port "$worker_port" &
pids+=("$!")

echo ""
echo "Open the store in the in-app browser: ${site_url}"
echo "Use Ctrl-C to stop both local services."

wait "${pids[@]}"
