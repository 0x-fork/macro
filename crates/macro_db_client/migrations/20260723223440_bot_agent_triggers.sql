-- Agent bots: bots that are triggered by events rather than driven purely by
-- inbound webhook calls.
--
-- `bot_type` distinguishes the existing registry bots ('standard') from agent
-- bots ('agent'). Agent bots carry a mode:
--   * 'macro'    — handled in-process by the internal Macro agent.
--   * 'external' — delivered to an external endpoint through a provisioned
--                  `webhook` row referenced by `agent_webhook_id`.
-- `agent_events` lists the events the agent is subscribed to. Only
-- 'channel.bot-mentioned' is supported today.

ALTER TABLE public.bots
    ADD COLUMN bot_type text NOT NULL DEFAULT 'standard'
        CONSTRAINT bots_bot_type_check CHECK (bot_type IN ('standard', 'agent')),
    ADD COLUMN agent_mode text
        CONSTRAINT bots_agent_mode_value_check CHECK (agent_mode IN ('macro', 'external')),
    ADD COLUMN agent_events text[]
        CONSTRAINT bots_agent_events_value_check
            CHECK (agent_events <@ ARRAY['channel.bot-mentioned']),
    ADD COLUMN agent_webhook_id text REFERENCES public.webhook(id);

-- Agent bots must have a mode and at least one subscribed event; standard bots
-- must have neither.
ALTER TABLE public.bots
    ADD CONSTRAINT bots_agent_config_check CHECK (
        (
            bot_type = 'agent'
            AND agent_mode IS NOT NULL
            AND agent_events IS NOT NULL
            AND cardinality(agent_events) >= 1
        )
        OR (
            bot_type = 'standard'
            AND agent_mode IS NULL
            AND agent_events IS NULL
            AND agent_webhook_id IS NULL
        )
    );

-- External agents deliver through a provisioned webhook; other bots never
-- reference one.
ALTER TABLE public.bots
    ADD CONSTRAINT bots_agent_webhook_check CHECK (
        (agent_mode = 'external' AND agent_webhook_id IS NOT NULL)
        OR (agent_mode IS DISTINCT FROM 'external' AND agent_webhook_id IS NULL)
    );
