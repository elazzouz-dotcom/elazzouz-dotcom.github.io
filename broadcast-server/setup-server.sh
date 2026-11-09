#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")"

if [[ "${EUID}" -ne 0 ]]; then
  echo "شغّل السكربت بصلاحيات sudo: sudo bash setup-server.sh"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker غير مثبت. ثبّته أولًا ثم أعد تشغيل السكربت."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose غير متاح. ثبّت Docker Compose Plugin ثم أعد المحاولة."
  exit 1
fi

if grep -qE 'CHANGE_ME_TO_A_LONG_RANDOM_PASSWORD|TIKTOK_RTMP_HOST|TIKTOK_STREAM_KEY' mediamtx.yml; then
  echo "أوقف التنفيذ: غيّر كلمة مرور MediaMTX وبيانات RTMP التجريبية داخل mediamtx.yml أولًا."
  exit 1
fi

# Open SSH first so enabling UFW does not cut off the current session.
ufw allow 22/tcp comment 'SSH'
ufw allow 1935/tcp comment 'RTMP ingest'
ufw allow 8889/tcp comment 'MediaMTX WebRTC HTTP'
ufw allow 8189/udp comment 'MediaMTX WebRTC ICE'
ufw allow 8890/udp comment 'MediaMTX WebRTC UDP'
ufw --force enable

# Start the persistent MediaMTX service.
docker compose up -d

printf '\nحالة الجدار الناري:\n'
ufw status verbose
printf '\nحالة MediaMTX:\n'
docker compose ps
printf '\nالسجلات الأخيرة:\n'
docker compose logs --tail=30 mediamtx
