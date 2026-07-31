#!/bin/sh
set -eu

PGUSER="${1:?user required}"
PGHOST="${2:?host required}"
PGDATABASE="${3:?database required}"

echo "[migrate] waiting for postgres at ${PGHOST}..."
until pg_isready -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" >/dev/null 2>&1; do
  sleep 1
done

psql -v ON_ERROR_STOP=1 -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" <<'SQL'
CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
SQL

for file in /migrations/*.sql; do
  [ -f "$file" ] || continue
  name="$(basename "$file")"
  applied="$(psql -tAc "SELECT 1 FROM \"__drizzle_migrations\" WHERE hash = '${name}'" \
    -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" || true)"
  if [ "$applied" = "1" ]; then
    echo "[migrate] skip ${name}"
    continue
  fi
  echo "[migrate] apply ${name}"
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -f "$file"
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" \
    -c "INSERT INTO \"__drizzle_migrations\" (hash, created_at) VALUES ('${name}', (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint)"
done

echo "[migrate] done"
