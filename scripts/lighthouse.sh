#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p lighthouse
python3 -m http.server 8766 --bind 127.0.0.1 >/dev/null 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
sleep 1

for page in index catalog order; do
  npx lighthouse "http://127.0.0.1:8766/${page}.html" \
    --quiet \
    --chrome-flags="--headless --no-sandbox --disable-gpu" \
    --only-categories=accessibility \
    --output=html \
    --output-path="lighthouse/accessibility-${page}.html"
done

echo "HTML-отчёты Lighthouse: lighthouse/accessibility-{index,catalog,order}.html"
