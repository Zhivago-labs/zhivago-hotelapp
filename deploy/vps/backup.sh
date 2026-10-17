#!/usr/bin/env bash
# Backup diário: dump do Postgres + uploads, guardados localmente (14 dias) e enviados pra fora da
# VPS via rclone. Agendar no crontab do usuário deploy (ver seção 5 do plano):
#   0 3 * * * /opt/zhivago/deploy/vps/backup.sh >> /home/deploy/zhivago-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")"
source .env

stamp=$(date +%Y-%m-%d_%H%M)
dir=backups
mkdir -p "$dir"

docker compose exec -T db pg_dump -U zhivago -d zhivago -Fc > "$dir/db_$stamp.dump"
tar -czf "$dir/uploads_$stamp.tar.gz" uploads

# Um dump vazio/truncado é pior que nenhum — falha alto em vez de rotacionar os bons fora.
if [ ! -s "$dir/db_$stamp.dump" ]; then
  echo "[$stamp] ERRO: dump vazio" >&2
  exit 1
fi

find "$dir" -type f -mtime +14 -delete

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy "$dir" "$BACKUP_REMOTE:zhivago-backups" --max-age 25h
fi

echo "[$stamp] backup ok"
