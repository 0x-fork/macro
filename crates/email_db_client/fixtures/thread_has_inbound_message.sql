-- Fixture for the denormalized email_threads.has_inbound_message flag.
--
-- Thread 1 (flag=true, stale on purpose): only a sent message (SENT label, no
--   INBOX) — the sent-only case, so a metadata recompute should clear it.
-- Thread 2 (flag=false): a received message with no INBOX label (archived, so
--   inbox_visible stays false) — a metadata recompute should set it, which is
--   what makes the thread read as done in the FE.
-- Thread 3 (flag=false): a sent message the user addressed to themselves — the
--   self-sent edge case counts as inbound.

INSERT INTO email_links (id, macro_id, fusionauth_user_id, email_address, provider, is_sync_active, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000e01', 'macro|inbound_user@example.com', '00000000-0000-0000-0000-000000000e01',
        'inbound_user@example.com', 'GMAIL', true, NOW(), NOW());

INSERT INTO email_contacts (id, link_id, email_address, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-0000000ce001',
        '00000000-0000-0000-0000-000000000e01',
        'inbound_user@example.com',
        NOW(), NOW()),
       ('00000000-0000-0000-0000-0000000ce002',
        '00000000-0000-0000-0000-000000000e01',
        'sender@example.com',
        NOW(), NOW());

INSERT INTO email_labels (id, link_id, provider_label_id, name, created_at)
VALUES ('00000000-0000-0000-0000-0000000be001', '00000000-0000-0000-0000-000000000e01', 'SENT', 'SENT', NOW());

INSERT INTO email_threads (id, link_id, inbox_visible, is_read, has_inbound_message, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-00000000e201',
        '00000000-0000-0000-0000-000000000e01',
        false, true, true, NOW(), NOW()),
       ('00000000-0000-0000-0000-00000000e202',
        '00000000-0000-0000-0000-000000000e01',
        false, true, false, NOW(), NOW()),
       ('00000000-0000-0000-0000-00000000e203',
        '00000000-0000-0000-0000-000000000e01',
        false, true, false, NOW(), NOW());

INSERT INTO email_messages (id, thread_id, link_id, provider_id, global_id, is_sent, from_contact_id, internal_date_ts,
                            has_attachments, is_read, is_starred, is_draft, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-00000000e501',
        '00000000-0000-0000-0000-00000000e201',
        '00000000-0000-0000-0000-000000000e01',
        'provider-msg-e501', 'gid-e501', TRUE,
        '00000000-0000-0000-0000-0000000ce001',
        '2025-01-05 10:00:00 +00:00',
        false, true, false, false, NOW(), NOW()),
       ('00000000-0000-0000-0000-00000000e502',
        '00000000-0000-0000-0000-00000000e202',
        '00000000-0000-0000-0000-000000000e01',
        'provider-msg-e502', 'gid-e502', FALSE,
        '00000000-0000-0000-0000-0000000ce002',
        '2025-01-06 10:00:00 +00:00',
        false, true, false, false, NOW(), NOW()),
       ('00000000-0000-0000-0000-00000000e503',
        '00000000-0000-0000-0000-00000000e203',
        '00000000-0000-0000-0000-000000000e01',
        'provider-msg-e503', 'gid-e503', TRUE,
        '00000000-0000-0000-0000-0000000ce001',
        '2025-01-07 10:00:00 +00:00',
        false, true, false, false, NOW(), NOW());

INSERT INTO email_message_labels (message_id, label_id)
VALUES ('00000000-0000-0000-0000-00000000e501', '00000000-0000-0000-0000-0000000be001'),
       ('00000000-0000-0000-0000-00000000e503', '00000000-0000-0000-0000-0000000be001');

-- Thread 1's sent message goes to someone else; thread 3's goes to the sender.
INSERT INTO email_message_recipients (message_id, contact_id, recipient_type)
VALUES ('00000000-0000-0000-0000-00000000e501', '00000000-0000-0000-0000-0000000ce002', 'TO'),
       ('00000000-0000-0000-0000-00000000e503', '00000000-0000-0000-0000-0000000ce001', 'TO');
