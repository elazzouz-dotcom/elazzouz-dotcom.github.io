#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")"

if [[ "${EUID}" -ne 0 ]]; then
  echo "شغّل السكربت بصلاحيات sudo: sudo bash setup-server.sh"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker وDocker Compose مطلوبان. شغّل install-docker.sh أولًا."
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "سيتم إنشاء .env محليًا بصلاحيات 600. لا تُظهر القيم أثناء الكتابة."
  read -r -s -p 'أنشئ كلمة مرور ناشر MediaMTX: ' publish_password; echo
  read -r -s -p 'أدخل وجهة RTMPS الكاملة من TikTok (rtmps://...#KEY): ' tiktok_dest; echo
  [[ ${#publish_password} -ge 16 ]] || { echo 'كلمة المرور يجب أن تكون 16 حرفًا على الأقل.'; exit 1; }
  [[ "$tiktok_dest" == rtmps://* && "$tiktok_dest" == *'#'* && "$tiktok_dest" != *' '* ]] || { echo 'وجهة RTMPS غير صالحة.'; exit 1; }
  umask 077
  printf 'PUBLISH_PASSWORD=%s\nTIKTOK_RTMP_DEST=%s\n' "$publish_password" "$tiktok_dest" > .env
  unset publish_password tiktok_dest
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a
[[ ${#PUBLISH_PASSWORD} -ge 16 ]] || { echo 'PUBLISH_PASSWORD غير صالح.'; exit 1; }
[[ "$TIKTOK_RTMP_DEST" == rtmps://* && "$TIKTOK_RTMP_DEST" == *'#'* && "$TIKTOK_RTMP_DEST" != *' '* ]] || { echo 'TIKTOK_RTMP_DEST غير صالح.'; exit 1; }

python3 - <<'PY'
from pathlib import Path
import os
source=Path('mediamtx.yml').read_text()
source=source.replace('__PUBLISH_PASSWORD__', os.environ['PUBLISH_PASSWORD'])
source=source.replace('__TIKTOK_RTMP_DEST__', os.environ['TIKTOK_RTMP_DEST'])
if '__PUBLISH_PASSWORD__' in source or '__TIKTOK_RTMP_DEST__' in source:
    raise SystemExit('قوالب الأسرار لم تُستبدل.')
Path('mediamtx.runtime.yml').write_text(source)
Path('mediamtx.runtime.yml').chmod(0o600)
PY

ufw allow 22/tcp comment 'SSH'
ufw allow 1935/tcp comment 'RTMP ingest'
ufw allow 8889/tcp comment 'MediaMTX WebRTC HTTP'
ufw allow 8189/udp comment 'MediaMTX WebRTC ICE'
ufw allow 8890/udp comment 'MediaMTX WebRTC UDP'
ufw --force enable

docker compose up -d
printf '\nتم التشغيل. لا يتم طباعة الأسرار.\n'
ufw status verbose
docker compose ps
docker compose logs --tail=25 mediamtx
