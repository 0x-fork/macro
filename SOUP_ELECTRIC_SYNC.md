# Soup sync over ElectricSQL (local)

A first working version of syncing the **soup** feed to clients with
[ElectricSQL](https://electric.ax/sync/) instead of polling the HTTP soup API.

## Why a table, not a view

Soup is an amalgamated read: the soup service merges ~9 entity types
(documents, chats, projects, email threads, channels, channel threads, calls,
CRM companies, foreign entities) **in Rust** from ~9 different Postgres tables,
each with its own per-user / per-team scoping (joins through `email_links`,
`comms_channel_participants`, `team_user`, `entity_access`, …).

Electric syncs **one table per shape** (`table` + a `WHERE` clause), driven by
Postgres **logical replication**. Logical replication cannot replicate a `VIEW`
or `MATERIALIZED VIEW` — neither can be added to a publication:

```
ERROR: cannot add relation "soup_view" to publication
DETAIL: This operation is not supported for views.
```

So we keep the **ergonomics of a view** while staying Electric-syncable:

| Object | Role |
| --- | --- |
| `soup_items_source` (VIEW) | defines the projection once; used for the backfill |
| `soup_items` (TABLE) | the replicable mirror Electric subscribes to |
| `soup_sync_*` triggers | keep `soup_items` current on every source insert/update/delete |

A client then syncs **one shape**: `table=soup_items WHERE user_id = <me> AND deleted = false`.

## What's included

- **Migration** `rust/cloud-storage/macro_db_client/migrations/20260625031630_soup_items_electric_sync.sql`
  — `soup_items` table (`REPLICA IDENTITY FULL`), the `soup_items_source`
  projection view, `AFTER` triggers on `Document` / `Chat` / `Project`, and a
  backfill.
- **Postgres** `docker-compose-databases.yml` — `wal_level=logical`
  (+ `max_wal_senders` / `max_replication_slots`).
- **Electric service** `docker-compose.yml` — `electricsql/electric:1.7.3`,
  `DATABASE_URL` → macrodb, `ELECTRIC_INSECURE=true`, host port **3100** (the
  frontend dev server owns 3000). Shape API: `http://localhost:3100/v1/shape`.
- **Frontend** (`js/app`) — `@electric-sql/client` wired into the real soup
  query layer:
  - `packages/queries/soup/electric/` — `createSoupItemsShape`,
    `mapSoupItemRowToEntity`, and the SolidJS `useElectricSoupItems` primitive.
  - `useSoupItemsFeed` (in `packages/queries/soup/items.ts`) — a swappable
    `EntityData[]` seam: Electric when `VITE_SOUP_ELECTRIC=true`, else the
    existing HTTP infinite query.
  - `electric` host added to `packages/core/constant/servers.ts`.
- **Ops** — `just run_electric`, `just verify_soup_electric`,
  `scripts/verify-soup-electric.sh`.

## Run it locally

```bash
# 1. macrodb migrated (creates soup_items + triggers + backfill)
just rust/cloud-storage/setup_macrodb        # or: just initialize_dbs

# 2. Postgres (wal_level=logical) + Electric
just run_electric

# 3. End-to-end check: write a Document, watch the shape reflect it
just verify_soup_electric                    # optional: pass a USER_ID

# 4. Frontend served from Electric
cd js/app && VITE_SOUP_ELECTRIC=true VITE_LOCAL_SERVERS=ALL bun run dev
```

Raw shape API (newest snapshot for a user):

```bash
curl -sG http://localhost:3100/v1/shape \
  --data-urlencode "table=soup_items" \
  --data-urlencode "where=user_id = 'demo-user'" \
  --data-urlencode "offset=-1" | jq '.[].value'
```

A feed component adopts Electric by reading from `useSoupItemsFeed(args)` (a
flat `EntityData[]` accessor); flipping `VITE_SOUP_ELECTRIC` swaps the source
with no further component changes.

## Verifying without Docker

The Macro-specific half (table → publication → logical replication stream) can
be verified against a plain Postgres with `wal_level=logical`, no Electric
needed — create minimal `Document`/`Chat`/`Project` tables, apply the
migration, then watch `soup_items` changes in the logical-decoding stream:

```sql
SELECT slot_name FROM pg_create_logical_replication_slot('electric_demo','test_decoding');
INSERT INTO "Document"("id","name","owner","fileType") VALUES ('d3','Q3 Plan','alice','docx');
UPDATE  "Project"  SET "deletedAt" = now() WHERE "id" = 'p1';
SELECT data FROM pg_logical_slot_get_changes('electric_demo', NULL, NULL) WHERE data LIKE '%soup_items%';
```

Each source write shows up as an INSERT / UPDATE (with full old+new images,
thanks to `REPLICA IDENTITY FULL`) / DELETE on `public.soup_items` — exactly
the stream Electric consumes.

## Scope & limitations (v1)

- **Entity types:** `document`, `chat`, `project` only. The other six slot in
  by extending `soup_items_source` + the trigger set + `mapSoupItemRowToEntity`.
- **Scoping:** the owning user (`Document.owner`, `Chat."userId"`,
  `Project."userId"`). `entity_access` sharing (a row per `(item, viewer)`, or a
  membership-aware shape) is a follow-up.
- **Feed semantics:** the shape syncs the full per-user set and sorts
  client-side by `sort_ts`. Soup filters / grouping / cursor pagination /
  frecency are **not** mirrored yet — `useSoupItemsFeed` keeps the HTTP path for
  those.
- **Auth:** `ELECTRIC_INSECURE=true` is local-only. Production must front
  Electric with a [gatekeeper/proxy](https://electric.ax/docs/guides/auth) that
  authorizes per-user shape access and injects the `user_id` `WHERE` clause
  rather than trusting the client.

## Next steps

1. Gatekeeper endpoint on the document-storage-service that authorizes a soup
   shape for the caller and proxies `/v1/shape`.
2. Extend the projection to the remaining six soup types.
3. Model `entity_access` sharing (per-viewer rows or membership shapes).
4. Push soup filtering/sorting into the shape `WHERE` (Electric supports
   `=,<,>,LIKE,AND,OR` and subqueries) where it pays off.
