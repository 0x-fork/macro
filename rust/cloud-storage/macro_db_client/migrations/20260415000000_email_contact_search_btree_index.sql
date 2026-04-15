-- no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ecsi_link_email_btree
    ON email_contact_search_index (link_id, lower(contact_email));
