-- Read receipts (open tracking) for sent emails.
--
-- A unique token is generated per outgoing message and embedded as a tracking
-- pixel URL in the message HTML. When the pixel is fetched, the open is
-- recorded by token on the sender's copy of the message.
ALTER TABLE email_messages
    ADD COLUMN open_tracking_token uuid,
    ADD COLUMN first_opened_at timestamptz,
    ADD COLUMN last_opened_at timestamptz,
    ADD COLUMN open_count integer NOT NULL DEFAULT 0;

-- The tracking pixel endpoint resolves messages by token.
CREATE UNIQUE INDEX email_messages_open_tracking_token_idx
    ON email_messages (open_tracking_token)
    WHERE open_tracking_token IS NOT NULL;

-- Per-inbox opt-out. Read receipts are on by default, like Superhuman.
ALTER TABLE email_settings
    ADD COLUMN read_receipts_enabled boolean NOT NULL DEFAULT true;
