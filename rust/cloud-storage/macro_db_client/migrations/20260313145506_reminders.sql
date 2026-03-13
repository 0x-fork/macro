CREATE TABLE reminders (
                           id            UUID        NOT NULL DEFAULT gen_random_uuid(),
                           user_id       TEXT        NOT NULL,
                           entity_type   TEXT        NOT NULL,
                           entity_id     UUID        NOT NULL,
                           reminder_time TIMESTAMPTZ NOT NULL,
                           done_time     TIMESTAMPTZ,
                           created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                           PRIMARY KEY (id)
);

-- All reminders for a user
CREATE INDEX idx_reminders_user_id ON reminders (user_id);

-- Pending (due & not done) reminders for a user
CREATE INDEX idx_reminders_user_pending ON reminders (user_id, reminder_time)
    WHERE done_time IS NULL;