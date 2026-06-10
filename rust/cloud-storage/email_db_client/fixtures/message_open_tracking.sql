-- SQL fixture for message open tracking (read receipt) tests

------------------------------------------------------------
-- User Link
------------------------------------------------------------

INSERT INTO email_links (id, macro_id, fusionauth_user_id, email_address, provider, is_sync_active, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000f01', 'macro|open_tracking_user@example.com', '00000000-0000-0000-0000-000000000f01',
        'open_tracking_user@example.com', 'GMAIL', true, NOW(), NOW());

------------------------------------------------------------
-- Contact
------------------------------------------------------------

INSERT INTO email_contacts (id, link_id, email_address, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-0000000cf001',
        '00000000-0000-0000-0000-000000000f01',
        'open_tracking_user@example.com',
        NOW(), NOW());

------------------------------------------------------------
-- Thread
------------------------------------------------------------

INSERT INTO email_threads (id, link_id, inbox_visible, is_read, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-00000000f201',
        '00000000-0000-0000-0000-000000000f01',
        true, true, NOW(), NOW());

------------------------------------------------------------
-- Message 1: Sent message (open tracking target)
------------------------------------------------------------

INSERT INTO email_messages (id, thread_id, link_id, provider_id, is_sent, from_contact_id, internal_date_ts,
                            has_attachments, is_read, is_starred, is_draft, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-00000000f501',
        '00000000-0000-0000-0000-00000000f201',
        '00000000-0000-0000-0000-000000000f01',
        'provider-msg-f501',
        TRUE,
        '00000000-0000-0000-0000-0000000cf001',
        '2025-01-05 10:00:00 +00:00',
        false, true, false, false, NOW(), NOW());

------------------------------------------------------------
-- Message 2: Draft message (must never record opens)
------------------------------------------------------------

INSERT INTO email_messages (id, thread_id, link_id, is_sent, from_contact_id, internal_date_ts,
                            has_attachments, is_read, is_starred, is_draft, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-00000000f502',
        '00000000-0000-0000-0000-00000000f201',
        '00000000-0000-0000-0000-000000000f01',
        FALSE,
        '00000000-0000-0000-0000-0000000cf001',
        '2025-01-05 11:00:00 +00:00',
        false, true, false, true, NOW(), NOW());
