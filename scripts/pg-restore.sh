#!/bin/bash
# PostgreSQL Restore Script
# Usage:
#   docker exec gdt-backend bash /app/scripts/pg-restore.sh <backup_file>
#   docker exec gdt-backend bash /app/scripts/pg-restore.sh game_designer_20250609_120000.sql.gz

set -euo pipefail

HOST="${POSTGRES_HOST:-postgres}"
PORT="${POSTGRES_PORT:-5432}"
USER="${POSTGRES_USER:-game_designer}"
DB="${POSTGRES_DB:-game_designer}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup_file>"
  echo "Available backups:"
  ls -la "${BACKUP_DIR}"/${DB}_*.sql.gz 2>/dev/null || echo "  (none)"
  exit 1
fi

FILEPATH="${1}"
if [[ "${FILEPATH}" != /* ]]; then
  FILEPATH="${BACKUP_DIR}/${FILEPATH}"
fi

if [ ! -f "${FILEPATH}" ]; then
  echo "Error: File not found: ${FILEPATH}"
  exit 1
fi

echo "[Restore] WARNING: This will replace the current database!"
echo "[Restore] Database: ${DB}@${HOST}:${PORT}"
echo "[Restore] Backup: ${FILEPATH}"
read -p "Continue? (yes/no): " CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
  echo "[Restore] Aborted"
  exit 0
fi

echo "[Restore] Restoring..."
gunzip -c "${FILEPATH}" | PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  -h "${HOST}" \
  -p "${PORT}" \
  -U "${USER}" \
  -d "${DB}" \
  -v ON_ERROR_STOP=0

echo "[Restore] Completed"
