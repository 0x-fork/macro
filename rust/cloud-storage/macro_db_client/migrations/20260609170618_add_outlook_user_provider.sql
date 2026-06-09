-- Add OUTLOOK as a supported email provider so Outlook (Microsoft Graph)
-- inboxes can be linked alongside Gmail.
--
-- Forward-only: Postgres cannot remove a value from an enum type without
-- rewriting it, so there is no accompanying down migration. ADD VALUE IF NOT
-- EXISTS is idempotent and (on Postgres 12+) safe inside the migration
-- transaction as long as the new value is not used in the same transaction.
ALTER TYPE email_user_provider_enum ADD VALUE IF NOT EXISTS 'OUTLOOK';
