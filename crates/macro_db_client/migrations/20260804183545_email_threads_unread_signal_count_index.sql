-- no-transaction
-- Backs the sidebar's unread-Signal badge: a per-link count over the same
-- predicate as the Signal tab's candidate scan. Narrower than
-- idx_email_threads_signal_view (which also spans read threads), so the count
-- stays index-only as an inbox's read history grows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_threads_unread_signal_count
    ON email_threads (link_id)
    WHERE inbox_visible AND is_signal AND NOT is_read AND latest_inbound_message_ts IS NOT NULL;
