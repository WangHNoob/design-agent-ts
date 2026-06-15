#!/bin/bash
# PostgreSQL Backup Script
# Usage: Run as a cron job or scheduled task
#   docker exec gdt-backend node /app/scripts/pg-backup.sh
#
# Environment variables (set in .env or docker-compose):
#   POSTGRES_URL       - Full connection string
#   POSTGRES_HOST      - Host (default: postgres)
#   POSTGRES_PORT      - Port (default: 5432)
#   POSTGRES_USER      - User (default: game_designer)
#   POSTGRES_PASSWORD  - Password
#   POSTGRES_DB        - Database name (default: game_designer)
#   BACKUP_DIR         - Backup directory (default: /backups)
#   BACKUP_RETENTION   - Number of backups to keep (default: 7)

set -euo pipefail

HOST="${POSTGRES_HOST:-postgres}"
PORT="${POSTGRES_PORT:-5432}"
USER="${POSTGRES_USER:-game_designer}"
DB="${POSTGRES_DB:-game_designer}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION="${BACKUP_RETENTION:-7}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${DB}_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "[Backup] Starting PostgreSQL backup: ${DB}@${HOST}:${PORT}"
echo "[Backup] Output: ${FILEPATH}"

PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${HOST}" \
  -p "${PORT}" \
  -U "${USER}" \
  -d "${DB}" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  | gzip > "${FILEPATH}"

SIZE=$(du -h "${FILEPATH}" | cut -f1)
echo "[Backup] Completed: ${FILENAME} (${SIZE})"

# Cleanup old backups
echo "[Backup] Retaining last ${RETENTION} backups..."
ls -t "${BACKUP_DIR}"/${DB}_*.sql.gz 2>/dev/null | tail -n +$((RETENTION + 1)) | xargs -r rm -f
echo "[Backup] Cleanup done"
