-- Add IMAP/SMTP as an email provider alongside Gmail so users can connect
-- arbitrary email servers.
--
-- Note: in Postgres 12+ ALTER TYPE ... ADD VALUE may run inside a transaction
-- as long as the new value isn't used within the same transaction. Nothing in
-- this migration inserts rows with the new value, so this is safe.
ALTER TYPE public.email_user_provider_enum ADD VALUE IF NOT EXISTS 'IMAP_SMTP';

-- How a client connects to an IMAP/SMTP server.
CREATE TYPE public.email_connection_security_enum AS ENUM (
    -- implicit TLS from the first byte (IMAPS 993 / SMTPS 465)
    'SSL_TLS',
    -- plaintext connection upgraded via STARTTLS (SMTP 587)
    'STARTTLS'
);

-- Connection settings + credentials for IMAP_SMTP links. Passwords are
-- encrypted at rest with AES-256-GCM using a key held in the email service's
-- environment (EMAIL_CREDENTIALS_ENCRYPTION_KEY); see email_utils::credential_crypto.
CREATE TABLE public.email_imap_smtp_credentials (
    link_id uuid PRIMARY KEY REFERENCES public.email_links (id) ON DELETE CASCADE,
    imap_host character varying(255) NOT NULL,
    imap_port integer NOT NULL,
    imap_security public.email_connection_security_enum NOT NULL,
    imap_username character varying(320) NOT NULL,
    imap_password_ciphertext bytea NOT NULL,
    smtp_host character varying(255) NOT NULL,
    smtp_port integer NOT NULL,
    smtp_security public.email_connection_security_enum NOT NULL,
    smtp_username character varying(320) NOT NULL,
    smtp_password_ciphertext bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Incremental sync state per IMAP folder, the IMAP analogue of
-- email_gmail_histories. last_seen_uid tracks the highest UID we've ingested;
-- a UIDVALIDITY change invalidates stored UIDs and forces a folder re-sync.
CREATE TABLE public.email_imap_folder_states (
    link_id uuid NOT NULL REFERENCES public.email_links (id) ON DELETE CASCADE,
    folder text NOT NULL,
    uid_validity bigint NOT NULL,
    last_seen_uid bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (link_id, folder)
);
