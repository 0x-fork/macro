-- Unified thread architecture, phase 1: polymorphic message parent.
--
-- A comms message now hangs off an arbitrary parent entity via the soft
-- (parent_type, parent_id) varchar pair (the same cross-domain reference
-- convention used by comms_attachments / comms_entity_mentions), instead of
-- being hard-wired to a channel. Channel-parented rows keep the denormalized
-- channel_id column so the ON DELETE CASCADE from comms_channels and the
-- existing channel indexes keep working.
--
-- The columns stay NULLABLE for now: NULL is read as "channel" (all
-- pre-existing rows are channel-parented, and test fixtures still insert
-- without the new columns). All production write paths stamp the columns as
-- of this change; a follow-up migration flips them NOT NULL once fixtures and
-- any stragglers are updated. Readers must use
--   COALESCE(parent_type, 'channel') / COALESCE(parent_id, channel_id::text)
-- which is exactly what the expression indexes below cover.

ALTER TABLE comms_messages
    ADD COLUMN parent_type varchar(32),
    ADD COLUMN parent_id   varchar;

-- Backfill existing rows. Bounded table today; for a production rollout at
-- larger scale run this as a batched UPDATE ... WHERE id IN (SELECT ... LIMIT n)
-- loop instead of one statement.
UPDATE comms_messages
SET parent_type = 'channel',
    parent_id   = channel_id::text
WHERE parent_type IS NULL;

-- Entity-parented rows have no channel; relax the old NOT NULL.
ALTER TABLE comms_messages
    ALTER COLUMN channel_id DROP NOT NULL;

-- A channel-parented row must carry its channel uuid (and only channel-
-- parented rows may). NULL parent_type is legacy shorthand for 'channel'.
ALTER TABLE comms_messages
    ADD CONSTRAINT comms_messages_channel_parent_consistency
    CHECK (
        ((COALESCE(parent_type, 'channel') = 'channel') = (channel_id IS NOT NULL))
        AND (parent_type IS NULL OR parent_id IS NOT NULL)
    );

-- Parent-scoped equivalents of the channel timeline indexes
-- (idx_comms_messages_channel_toplevel_cursor / _channel_created_at_active).
CREATE INDEX idx_comms_messages_parent_toplevel_cursor
    ON comms_messages (
        (COALESCE(parent_type, 'channel')),
        (COALESCE(parent_id, channel_id::text)),
        created_at DESC,
        id DESC
    )
    WHERE thread_id IS NULL;

CREATE INDEX idx_comms_messages_parent_created_at_active
    ON comms_messages (
        (COALESCE(parent_type, 'channel')),
        (COALESCE(parent_id, channel_id::text)),
        created_at DESC
    )
    WHERE deleted_at IS NULL;

-- Thread-level state channels never needed. One row per top-level message
-- that has any of it; absence means (resolved = false, no anchor, no legacy
-- identity).
CREATE TABLE comms_thread_details (
    root_message_id  uuid PRIMARY KEY REFERENCES comms_messages (id) ON DELETE CASCADE,
    resolved         boolean NOT NULL DEFAULT false,
    -- Lexical anchor mark id for document-anchored threads. NULL for
    -- unanchored ("discussion") threads — this replaces the legacy
    -- 'DISCUSSION:' markId sentinel from the annotations system.
    mark_id          text,
    -- Legacy identity for rows migrated from the annotations ("Thread",
    -- bigint id) or CRM (crm_thread, uuid id) comment systems; stored as text
    -- to cover both. Serves old deep links and notification metadata.
    legacy_source    varchar(16),
    legacy_thread_id text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CHECK ((legacy_source IS NULL) = (legacy_thread_id IS NULL))
);

CREATE UNIQUE INDEX idx_comms_thread_details_legacy
    ON comms_thread_details (legacy_source, legacy_thread_id)
    WHERE legacy_thread_id IS NOT NULL;

CREATE INDEX idx_comms_thread_details_mark_id
    ON comms_thread_details (mark_id)
    WHERE mark_id IS NOT NULL;
