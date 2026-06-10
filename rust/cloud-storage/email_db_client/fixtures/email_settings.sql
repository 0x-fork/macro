-- SQL fixture for email settings tests

------------------------------------------------------------
-- Link with an existing settings row (signature enabled)
------------------------------------------------------------

INSERT INTO email_links (id, macro_id, fusionauth_user_id, email_address, provider, is_sync_active, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000a01', 'macro|settings_user@example.com', '00000000-0000-0000-0000-000000000a01',
        'settings_user@example.com', 'GMAIL', true, NOW(), NOW());

INSERT INTO email_settings (link_id, signature_on_replies_forwards)
VALUES ('00000000-0000-0000-0000-000000000a01', true);

------------------------------------------------------------
-- Link without a settings row
------------------------------------------------------------

INSERT INTO email_links (id, macro_id, fusionauth_user_id, email_address, provider, is_sync_active, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000a02', 'macro|settingsless_user@example.com', '00000000-0000-0000-0000-000000000a02',
        'settingsless_user@example.com', 'GMAIL', true, NOW(), NOW());
