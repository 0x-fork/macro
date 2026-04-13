CREATE TABLE IF NOT EXISTS agent_schedules
(
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT                     NOT NULL,
    chat_id                 TEXT                     NOT NULL REFERENCES "Chat" (id) ON DELETE CASCADE,
    name                    TEXT                     NOT NULL,
    prompt                  TEXT                     NOT NULL,
    additional_instructions TEXT,
    cron                    TEXT                     NOT NULL,
    timezone                TEXT                     NOT NULL,
    model                   TEXT                     NOT NULL,
    toolset                 TEXT                     NOT NULL DEFAULT 'all',
    enabled                 BOOLEAN                  NOT NULL DEFAULT TRUE,
    next_run_at             TIMESTAMPTZ              NOT NULL,
    last_run_at             TIMESTAMPTZ,
    last_run_status         TEXT,
    last_error              TEXT,
    last_stream_id          TEXT,
    lease_expires_at        TIMESTAMPTZ,
    created_at              TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ              NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_schedules_user_id_idx
    ON agent_schedules (user_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agent_schedules_due_idx
    ON agent_schedules (next_run_at)
    WHERE deleted_at IS NULL AND enabled = TRUE;
