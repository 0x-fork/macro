-- Persists a Macro user's Google Drive connection.
--
-- The OAuth refresh token itself lives in FusionAuth (the identity-provider
-- link); this table only records enough to know a user is connected and to
-- resolve the Drive account email that the access-token endpoint keys off.
CREATE TABLE IF NOT EXISTS google_drive_links
(
    id                 UUID        PRIMARY KEY NOT NULL,
    macro_id           TEXT        NOT NULL,
    fusionauth_user_id UUID        NOT NULL,
    email              TEXT        NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- One Drive link per Macro user (supports upsert ON CONFLICT (macro_id)).
    CONSTRAINT google_drive_links_macro_id_key UNIQUE (macro_id)
);

CREATE INDEX IF NOT EXISTS idx_google_drive_links_fusionauth_user_id
    ON google_drive_links (fusionauth_user_id);
