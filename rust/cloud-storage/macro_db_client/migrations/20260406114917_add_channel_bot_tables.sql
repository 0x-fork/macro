-- Integration tier enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comms_integration_tier') THEN
        CREATE TYPE comms_integration_tier AS ENUM ('native', 'template_guided', 'generic');
    END IF;
END
$$;

-- Bot integrations lookup table (seeded below)
CREATE TABLE IF NOT EXISTS comms_webhook_integrations (
    id UUID PRIMARY KEY NOT NULL,
    key VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    icon_url TEXT,
    tier comms_integration_tier NOT NULL,
    payload_template TEXT,
    setup_instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Channel bots table
CREATE TABLE IF NOT EXISTS comms_channel_webhooks (
    id UUID PRIMARY KEY NOT NULL,
    channel_id UUID NOT NULL REFERENCES comms_channels(id) ON DELETE CASCADE,
    integration_id UUID NOT NULL REFERENCES comms_webhook_integrations(id),
    name VARCHAR(255) NOT NULL,
    token_hash TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_channel_webhooks_channel_id ON comms_channel_webhooks(channel_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_channel_webhooks_token_hash ON comms_channel_webhooks(token_hash) WHERE deleted_at IS NULL;

-- Seed initial integrations
INSERT INTO comms_webhook_integrations (id, key, name, icon_url, tier, payload_template, setup_instructions) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'generic', 'Generic Webhook', NULL, 'generic'::comms_integration_tier, NULL,
     'Send a POST request to the webhook URL with a JSON body: `{"text": "Your message here"}`'),
    ('a0000000-0000-0000-0000-000000000002', 'github', 'GitHub', NULL, 'native'::comms_integration_tier, NULL,
     'Paste the webhook URL into your GitHub repository settings under Webhooks.'),
    ('a0000000-0000-0000-0000-000000000003', 'gitlab', 'GitLab', NULL, 'native'::comms_integration_tier, NULL,
     'Paste the webhook URL into your GitLab project settings under Webhooks.'),
    ('a0000000-0000-0000-0000-000000000004', 'pagerduty', 'PagerDuty', NULL, 'native'::comms_integration_tier, NULL,
     'Add the webhook URL as a Generic Webhook extension in your PagerDuty service integrations.'),
    ('a0000000-0000-0000-0000-000000000005', 'datadog', 'Datadog', NULL, 'template_guided'::comms_integration_tier,
     '{"text": "$EVENT_TITLE: $ALERT_STATUS\n$EVENT_MSG\n$LINK"}',
     'In Datadog, go to Integrations > Webhooks. Create a new webhook with the URL below and use the suggested payload template.')
ON CONFLICT DO NOTHING;
