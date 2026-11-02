#!/usr/bin/env bash
# Database snapshot for Fit2Perform (Supabase project peufunxsckntvzyulddz).
#
# Writes:
#   supabase/schema.sql                         schema only (tables, views, functions,
#                                               policies, grants). Safe to commit.
#   _private/backups/fit2perform-<date>.dump    full data backup (athlete health data).
#                                               Git-ignored. Never commit or share it.
#
# Needs pg_dump 17 or newer:  brew install libpq && brew link --force libpq
# Connection string: Supabase dashboard > Connect > Session pooler (port 5432).
# Run:  SUPABASE_DB_URL='postgresql://...' ./scripts/db-backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "Set SUPABASE_DB_URL to the Session pooler connection string first." >&2
  exit 1
fi

major=$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
if [ "$major" -lt 17 ]; then
  echo "pg_dump $major found; need 17+ (brew install libpq && brew link --force libpq)." >&2
  exit 1
fi

pg_dump "$SUPABASE_DB_URL" --schema-only --schema=public --no-owner \
  --file=supabase/schema.sql
echo "Schema written to supabase/schema.sql"

mkdir -p _private/backups
out="_private/backups/fit2perform-$(date +%Y-%m-%d).dump"
pg_dump "$SUPABASE_DB_URL" --format=custom --schema=public --schema=auth \
  --no-owner --file="$out"
echo "Full backup written to $out (keep it private)"
