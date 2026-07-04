-- no-transaction
-- Index backing GET /email/threads/delta (the email content cache's change
-- feed): each page is a bounded keyset scan over (link_id, updated_at, id)
-- per link. The trailing id column makes it an index-only scan and supports
-- the (updated_at, id) keyset tie-break.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_threads_link_id_updated_at
ON email_threads (link_id, updated_at, id);
