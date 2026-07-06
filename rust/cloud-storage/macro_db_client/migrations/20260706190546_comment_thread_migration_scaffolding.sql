-- Unified thread architecture, phase 2: scaffolding for migrating document
-- annotation comments and CRM comments into comms_messages.
--
-- The actual data move is performed by the backfill_comment_threads binary
-- (batched, idempotent, re-runnable); this migration only creates the
-- bookkeeping structures it writes to.

-- Full legacy-comment -> unified-message mapping, one row per migrated
-- comment. comms_thread_details.legacy_* covers thread-level lookups (deep
-- links); this table covers comment-level references (e.g. notification
-- metadata comment_id) and lets the backfill re-run without duplicating.
CREATE TABLE legacy_comment_message_map (
    -- 'annotation' (document "Comment", bigint ids) or 'crm' (crm_comment,
    -- uuid ids); ids stored as text to cover both.
    legacy_source     varchar(16) NOT NULL,
    legacy_comment_id text        NOT NULL,
    legacy_thread_id  text        NOT NULL,
    message_id        uuid        NOT NULL REFERENCES comms_messages (id) ON DELETE CASCADE,
    root_message_id   uuid        NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (legacy_source, legacy_comment_id)
);

CREATE INDEX idx_legacy_comment_message_map_thread
    ON legacy_comment_message_map (legacy_source, legacy_thread_id);

CREATE INDEX idx_legacy_comment_message_map_message
    ON legacy_comment_message_map (message_id);

-- PDF/DOCX anchors survive unification as-is (anchoring stays document-
-- specific); they just gain a pointer to the unified thread so the derived
-- modificationData JSONB can be rebuilt from the new source at read-cutover.
-- Populated by the backfill; the legacy bigint "threadId" columns stay
-- authoritative until the annotations read path is retired.
ALTER TABLE "ThreadAnchor"
    ADD COLUMN "threadMessageId" uuid;

CREATE INDEX "idx_thread_anchor_thread_message_id"
    ON "ThreadAnchor" ("threadMessageId")
    WHERE "threadMessageId" IS NOT NULL;
