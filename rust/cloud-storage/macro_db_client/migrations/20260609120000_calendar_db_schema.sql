-- Calendar feature: user-owned events and their invited attendees.
--
-- Instants are stored as epoch-millis (BIGINT) to match the frontend's
-- instant-based model exactly and to avoid timezone ambiguity on the wire.
-- Audit columns are likewise epoch-millis so the schema needs no chrono/time
-- mapping in the repository layer.

CREATE TABLE calendar_event (
    id          uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     text   NOT NULL REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    title       text   NOT NULL DEFAULT '',
    description text,
    location    text,
    start_ms    bigint NOT NULL,
    end_ms      bigint NOT NULL,
    all_day     boolean NOT NULL DEFAULT false,
    color       text   NOT NULL DEFAULT 'blue',
    created_ms  bigint NOT NULL DEFAULT (floor(extract(epoch FROM now()) * 1000))::bigint,
    updated_ms  bigint NOT NULL DEFAULT (floor(extract(epoch FROM now()) * 1000))::bigint
);

-- Range scans for "events for this user between start and end" are the hot path.
CREATE INDEX idx_calendar_event_user_range
    ON calendar_event (user_id, start_ms, end_ms);

CREATE TABLE calendar_attendee (
    id         uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id   uuid   NOT NULL REFERENCES calendar_event (id) ON DELETE CASCADE,
    email      text   NOT NULL,
    name       text,
    -- One of: pending | accepted | declined | tentative
    status     text   NOT NULL DEFAULT 'pending',
    -- Epoch-millis the invite email was sent, NULL until invited.
    invited_ms bigint,
    created_ms bigint NOT NULL DEFAULT (floor(extract(epoch FROM now()) * 1000))::bigint,
    UNIQUE (event_id, email)
);

CREATE INDEX idx_calendar_attendee_event ON calendar_attendee (event_id);
