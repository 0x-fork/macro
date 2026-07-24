-- Denormalized "thread has at least one inbound message" flag. `inbox_visible`
-- alone cannot tell a thread the user marked done apart from a thread that was
-- never in the inbox (a sent-only thread: INBOX-and-not-SENT is the gate in
-- update_thread_metadata), so both read as done in the FE. This flag is
-- label-independent -- derived from is_sent/is_draft/sender-is-recipient, so it
-- survives archiving -- and done becomes
-- `NOT inbox_visible AND has_inbound_message`. Maintained by
-- update_thread_metadata (email_db_client and the email crate); existing
-- sent-only threads are cleared by the backfill_inbound_flags util in
-- email_service.
--
-- Existing rows are filled with true, which preserves today's
-- `done == NOT inbox_visible` semantics until the backfill runs; new rows
-- default to false and are computed by the first update_thread_metadata pass.
ALTER TABLE email_threads
    ADD COLUMN IF NOT EXISTS has_inbound_message boolean NOT NULL DEFAULT true;

ALTER TABLE email_threads
    ALTER COLUMN has_inbound_message SET DEFAULT false;
