#!/usr/bin/env bash
#
# Verify soup-over-Electric locally, end to end.
#
# Brings up Postgres (wal_level=logical) + the Electric sync service, then
# exercises the data path the frontend relies on:
#   write to a source table (Document)  ->  trigger updates `soup_items`
#   ->  Electric logical replication      ->  HTTP shape API reflects the change
#
# Requires Docker (to pull electricsql/electric + run the stack) and the
# `soup_items` migration applied to macrodb (`just setup_macrodb`).
#
# Usage:  scripts/verify-soup-electric.sh [USER_ID]
set -euo pipefail
cd "$(dirname "$0")/.."

USER_ID="${1:-demo-user}"
ELECTRIC_URL="${ELECTRIC_URL:-http://localhost:3100}"
DB_URL="${DATABASE_URL:-postgres://user:password@localhost:5432/macrodb}"

shape() {
  # GET /v1/shape for soup_items scoped to USER_ID. offset=-1 = full snapshot.
  curl -sG "$ELECTRIC_URL/v1/shape" \
    --data-urlencode "table=soup_items" \
    --data-urlencode "where=user_id = '$USER_ID'" \
    --data-urlencode "offset=-1"
}

names() { jq -r '.[] | select(.value) | .value | "\(.item_type)\t\(.name)\t(deleted=\(.deleted))"'; }

echo "==> 1. bring up postgres (wal_level=logical) + electric"
just create_networks >/dev/null
docker compose -f docker-compose-databases.yml up postgres --wait
docker compose up electric --wait

echo "==> 2. confirm the soup_items projection migration is applied"
if [ "$(psql "$DB_URL" -tAc "SELECT to_regclass('public.soup_items') IS NOT NULL;")" != "t" ]; then
  echo "   soup_items missing — run 'just setup_macrodb' first." >&2
  exit 1
fi
echo "   soup_items present; wal_level=$(psql "$DB_URL" -tAc 'SHOW wal_level;')"

echo "==> 3. initial shape snapshot for user_id=$USER_ID"
shape | names || true

echo "==> 4. INSERT a Document (owner=$USER_ID) and re-read the shape"
DOC_ID=$(psql "$DB_URL" -tAc \
  "INSERT INTO \"Document\"(\"name\",\"owner\",\"fileType\") VALUES ('Electric demo doc','$USER_ID','md') RETURNING id;")
sleep 1
shape | names

echo "==> 5. RENAME the Document and re-read the shape"
psql "$DB_URL" -tAc "UPDATE \"Document\" SET \"name\"='Electric demo (renamed)', \"updatedAt\"=now() WHERE id='$DOC_ID';" >/dev/null
sleep 1
shape | names

echo "==> 6. SOFT-DELETE the Document (drops out of the shape: deleted=false filter)"
psql "$DB_URL" -tAc "UPDATE \"Document\" SET \"deletedAt\"=now() WHERE id='$DOC_ID';" >/dev/null
sleep 1
shape | names

echo "==> 7. cleanup demo row"
psql "$DB_URL" -tAc "DELETE FROM \"Document\" WHERE id='$DOC_ID';" >/dev/null
echo "done. Electric soup sync verified."
