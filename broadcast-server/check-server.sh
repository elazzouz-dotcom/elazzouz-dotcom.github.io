#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo 'Docker غير مثبت'; exit 1; }
docker compose ps
printf '\nاختبار المنافذ المحلية:\n'
for port in 1935 8889; do
  if (echo >/dev/tcp/127.0.0.1/$port) >/dev/null 2>&1; then
    echo "$port/tcp: يعمل"
  else
    echo "$port/tcp: غير متاح"
  fi
done
if command -v ufw >/dev/null; then
  printf '\nUFW:\n'
  ufw status | head -20
fi
