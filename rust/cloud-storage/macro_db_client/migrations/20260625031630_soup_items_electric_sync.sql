-- Soup-over-Electric: a denormalized, replicable projection of "soup" items.
--
-- Background: "soup" is an amalgamated read feed built in Rust from ~9 different
-- source tables (Document, Chat, Project, email_threads, comms_channels, ...).
-- ElectricSQL syncs a single Postgres *table* per shape (table + WHERE), driven
-- by logical replication. Postgres logical replication cannot replicate VIEWs or
-- MATERIALIZED VIEWs (they can't be added to a publication), so we keep the
-- *ergonomics* of a view while staying Electric-syncable:
--
--   * `soup_items_source` VIEW   -> defines the projection once (readable + backfill)
--   * `soup_items` TABLE         -> the replicable mirror Electric subscribes to
--   * per-source AFTER triggers  -> keep `soup_items` current on insert/update/delete
--
-- A client then syncs ONE Electric shape: table=soup_items WHERE user_id = <me>.
--
-- v1 scope: Document, Chat, Project, scoped to the owning user (owner / userId).
-- Follow-ups: entity_access sharing (a row per (item, viewer)) and the other six
-- soup entity types (email threads, channels, channel threads, calls, crm
-- companies, foreign entities).

-- ---------------------------------------------------------------------------
-- Replicable mirror table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS soup_items (
    -- item_type || ':' || entity_id — a single-column PK Electric can key on,
    -- collision-free across the heterogeneous source tables.
    soup_id     TEXT        PRIMARY KEY,
    entity_id   TEXT        NOT NULL,
    item_type   TEXT        NOT NULL,            -- 'document' | 'chat' | 'project'
    user_id     TEXT        NOT NULL,            -- macro user this row is visible to (owner)
    name        TEXT,
    project_id  TEXT,
    file_type   TEXT,
    sort_ts     TIMESTAMPTZ NOT NULL,            -- feed sort key (== updated_at)
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    deleted     BOOLEAN     NOT NULL DEFAULT FALSE,
    data        JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS soup_items_user_sort_idx
    ON soup_items (user_id, sort_ts DESC);

-- Electric wants full row images so updates/deletes carry every column.
ALTER TABLE soup_items REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- Projection definition (the "view" — readable + used for the initial backfill)
-- ---------------------------------------------------------------------------
-- Source timestamps are TIMESTAMP(3) (no tz); they are stored as UTC, so we
-- reinterpret them as UTC to produce TIMESTAMPTZ values.
CREATE OR REPLACE VIEW soup_items_source AS
    SELECT
        'document:' || d."id"               AS soup_id,
        d."id"                              AS entity_id,
        'document'                          AS item_type,
        d."owner"                           AS user_id,
        d."name"                            AS name,
        d."projectId"                       AS project_id,
        d."fileType"                        AS file_type,
        (d."updatedAt" AT TIME ZONE 'UTC')  AS sort_ts,
        (d."createdAt" AT TIME ZONE 'UTC')  AS created_at,
        (d."updatedAt" AT TIME ZONE 'UTC')  AS updated_at,
        (d."deletedAt" IS NOT NULL)         AS deleted,
        jsonb_build_object('fileType', d."fileType", 'uploaded', d."uploaded") AS data
    FROM "Document" d
    UNION ALL
    SELECT
        'chat:' || c."id",
        c."id",
        'chat',
        c."userId",
        c."name",
        c."projectId",
        NULL,
        (c."updatedAt" AT TIME ZONE 'UTC'),
        (c."createdAt" AT TIME ZONE 'UTC'),
        (c."updatedAt" AT TIME ZONE 'UTC'),
        (c."deletedAt" IS NOT NULL),
        jsonb_build_object('isPersistent', c."isPersistent", 'model', c."model")
    FROM "Chat" c
    UNION ALL
    SELECT
        'project:' || p."id",
        p."id",
        'project',
        p."userId",
        p."name",
        p."parentId",
        NULL,
        (p."updatedAt" AT TIME ZONE 'UTC'),
        (p."createdAt" AT TIME ZONE 'UTC'),
        (p."updatedAt" AT TIME ZONE 'UTC'),
        (p."deletedAt" IS NOT NULL),
        '{}'::jsonb
    FROM "Project" p;

-- ---------------------------------------------------------------------------
-- Trigger functions: keep soup_items current from each source table.
-- AFTER row triggers so they never block the source write path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION soup_sync_document() RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM soup_items WHERE soup_id = 'document:' || OLD."id";
        RETURN OLD;
    END IF;
    INSERT INTO soup_items (
        soup_id, entity_id, item_type, user_id, name, project_id, file_type,
        sort_ts, created_at, updated_at, deleted, data
    ) VALUES (
        'document:' || NEW."id", NEW."id", 'document', NEW."owner", NEW."name",
        NEW."projectId", NEW."fileType",
        (NEW."updatedAt" AT TIME ZONE 'UTC'),
        (NEW."createdAt" AT TIME ZONE 'UTC'),
        (NEW."updatedAt" AT TIME ZONE 'UTC'),
        (NEW."deletedAt" IS NOT NULL),
        jsonb_build_object('fileType', NEW."fileType", 'uploaded', NEW."uploaded")
    )
    ON CONFLICT (soup_id) DO UPDATE SET
        user_id    = EXCLUDED.user_id,
        name       = EXCLUDED.name,
        project_id = EXCLUDED.project_id,
        file_type  = EXCLUDED.file_type,
        sort_ts    = EXCLUDED.sort_ts,
        updated_at = EXCLUDED.updated_at,
        deleted    = EXCLUDED.deleted,
        data       = EXCLUDED.data;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION soup_sync_chat() RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM soup_items WHERE soup_id = 'chat:' || OLD."id";
        RETURN OLD;
    END IF;
    INSERT INTO soup_items (
        soup_id, entity_id, item_type, user_id, name, project_id, file_type,
        sort_ts, created_at, updated_at, deleted, data
    ) VALUES (
        'chat:' || NEW."id", NEW."id", 'chat', NEW."userId", NEW."name",
        NEW."projectId", NULL,
        (NEW."updatedAt" AT TIME ZONE 'UTC'),
        (NEW."createdAt" AT TIME ZONE 'UTC'),
        (NEW."updatedAt" AT TIME ZONE 'UTC'),
        (NEW."deletedAt" IS NOT NULL),
        jsonb_build_object('isPersistent', NEW."isPersistent", 'model', NEW."model")
    )
    ON CONFLICT (soup_id) DO UPDATE SET
        user_id    = EXCLUDED.user_id,
        name       = EXCLUDED.name,
        project_id = EXCLUDED.project_id,
        sort_ts    = EXCLUDED.sort_ts,
        updated_at = EXCLUDED.updated_at,
        deleted    = EXCLUDED.deleted,
        data       = EXCLUDED.data;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION soup_sync_project() RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM soup_items WHERE soup_id = 'project:' || OLD."id";
        RETURN OLD;
    END IF;
    INSERT INTO soup_items (
        soup_id, entity_id, item_type, user_id, name, project_id, file_type,
        sort_ts, created_at, updated_at, deleted, data
    ) VALUES (
        'project:' || NEW."id", NEW."id", 'project', NEW."userId", NEW."name",
        NEW."parentId", NULL,
        (NEW."updatedAt" AT TIME ZONE 'UTC'),
        (NEW."createdAt" AT TIME ZONE 'UTC'),
        (NEW."updatedAt" AT TIME ZONE 'UTC'),
        (NEW."deletedAt" IS NOT NULL),
        '{}'::jsonb
    )
    ON CONFLICT (soup_id) DO UPDATE SET
        user_id    = EXCLUDED.user_id,
        name       = EXCLUDED.name,
        project_id = EXCLUDED.project_id,
        sort_ts    = EXCLUDED.sort_ts,
        updated_at = EXCLUDED.updated_at,
        deleted    = EXCLUDED.deleted,
        data       = EXCLUDED.data;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS soup_sync_document_trg ON "Document";
CREATE TRIGGER soup_sync_document_trg
    AFTER INSERT OR UPDATE OR DELETE ON "Document"
    FOR EACH ROW EXECUTE FUNCTION soup_sync_document();

DROP TRIGGER IF EXISTS soup_sync_chat_trg ON "Chat";
CREATE TRIGGER soup_sync_chat_trg
    AFTER INSERT OR UPDATE OR DELETE ON "Chat"
    FOR EACH ROW EXECUTE FUNCTION soup_sync_chat();

DROP TRIGGER IF EXISTS soup_sync_project_trg ON "Project";
CREATE TRIGGER soup_sync_project_trg
    AFTER INSERT OR UPDATE OR DELETE ON "Project"
    FOR EACH ROW EXECUTE FUNCTION soup_sync_project();

-- ---------------------------------------------------------------------------
-- Initial backfill from the projection view.
-- ---------------------------------------------------------------------------
INSERT INTO soup_items (
    soup_id, entity_id, item_type, user_id, name, project_id, file_type,
    sort_ts, created_at, updated_at, deleted, data
)
SELECT
    soup_id, entity_id, item_type, user_id, name, project_id, file_type,
    sort_ts, created_at, updated_at, deleted, data
FROM soup_items_source
ON CONFLICT (soup_id) DO NOTHING;
