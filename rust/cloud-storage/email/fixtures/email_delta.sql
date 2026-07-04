-- Fixture for the thread delta feed (thread_delta) and its watermark bumps.
-- Two links; link A has four threads with deterministic updated_at values,
-- including a tie (T3/T4) to exercise the (updated_at, id) keyset tie-break.

INSERT INTO email_links (id, macro_id, fusionauth_user_id, email_address, provider, is_sync_active, created_at, updated_at)
VALUES
    ('aaaaaaaa-0000-0000-0000-00000000000a', 'macro|delta-a@test.com', 'fa-delta-a', 'delta-a@test.com', 'GMAIL', true, NOW(), NOW()),
    ('bbbbbbbb-0000-0000-0000-00000000000b', 'macro|delta-b@test.com', 'fa-delta-b', 'delta-b@test.com', 'GMAIL', true, NOW(), NOW());

INSERT INTO email_threads (id, provider_id, link_id, inbox_visible, is_read, created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'delta-t1', 'aaaaaaaa-0000-0000-0000-00000000000a', true, false, '2025-03-01 00:00:00+00', '2025-03-01 00:00:00+00'),
    ('00000000-0000-0000-0000-000000000002', 'delta-t2', 'aaaaaaaa-0000-0000-0000-00000000000a', true, false, '2025-03-01 00:00:00+00', '2025-03-02 00:00:00+00'),
    ('00000000-0000-0000-0000-000000000003', 'delta-t3', 'aaaaaaaa-0000-0000-0000-00000000000a', true, false, '2025-03-01 00:00:00+00', '2025-03-03 00:00:00+00'),
    ('00000000-0000-0000-0000-000000000004', 'delta-t4', 'aaaaaaaa-0000-0000-0000-00000000000a', true, false, '2025-03-01 00:00:00+00', '2025-03-03 00:00:00+00'),
    ('00000000-0000-0000-0000-0000000000b1', 'delta-tb1', 'bbbbbbbb-0000-0000-0000-00000000000b', true, false, '2025-03-01 00:00:00+00', '2025-03-02 12:00:00+00');

-- One message on T1 so label/read mutations have something to touch.
INSERT INTO email_messages (id, provider_id, thread_id, link_id, internal_date_ts, snippet, subject, is_read, is_sent, is_draft, has_attachments, created_at, updated_at)
VALUES
    ('e0000000-0000-0000-0000-000000000001', 'delta-msg-1', '00000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a',
     '2025-03-01 00:00:00+00', 'Delta message', 'Delta', false, false, false, false, '2025-03-01 00:00:00+00', '2025-03-01 00:00:00+00');

-- A label on link A for insert/delete_message_labels_batch.
INSERT INTO email_labels (id, link_id, provider_label_id, name, created_at)
VALUES
    ('ab000000-0000-0000-0000-0000000000ab', 'aaaaaaaa-0000-0000-0000-00000000000a', 'IMPORTANT', 'IMPORTANT', NOW());
