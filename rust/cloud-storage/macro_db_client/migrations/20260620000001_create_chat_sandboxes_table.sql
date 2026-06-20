-- Per-chat coding sandbox association for the coding-agent feature.
--
-- Maps a chat to the repository the user selected and the sandbox provisioned
-- to work on it. One sandbox per chat. Backed by coding_agent::PgSandboxRegistry.
--
-- NOTE: created without sqlx-cli (unavailable in the authoring environment).
-- If the timestamp prefix conflicts with another pending migration, regenerate
-- via `sqlx migrate add create_chat_sandboxes_table` and move this SQL into it.

CREATE TABLE IF NOT EXISTS chat_sandboxes (
    chat_id     text PRIMARY KEY,
    user_id     text NOT NULL,
    repo        text NOT NULL,
    backend     text NOT NULL,
    sandbox_id  text,
    status      text NOT NULL DEFAULT 'none',
    work_branch text,
    snapshot_id text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sandboxes_user_id ON chat_sandboxes (user_id);
