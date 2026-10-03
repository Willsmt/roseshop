#!/usr/bin/env bash
# Smoke test pós-deploy: exige /api/health = 200 em até ~60s.
set -u
URL="$1"
code="000"
for _ in $(seq 1 10); do
  code=$(curl -s -o /tmp/health.json -w "%{http_code}" "$URL" || true)
  if [ "$code" = "200" ]; then
    echo "health OK: $(cat /tmp/health.json)"
    exit 0
  fi
  sleep 6
done
echo "health FALHOU: HTTP $code — $(cat /tmp/health.json 2>/dev/null)"
exit 1
