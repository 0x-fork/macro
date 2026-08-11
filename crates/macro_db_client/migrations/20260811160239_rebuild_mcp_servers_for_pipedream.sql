-- MCP connector auth moves wholesale to Pipedream Connect: Pipedream owns
-- the OAuth grants and tokens, we store only which app a user connected and
-- the Pipedream account ID the grant lives under. The previous shape (rows
-- keyed by server URL carrying encrypted OAuth credentials, later a Nango
-- connection ID) has no forward migration path — the in-house grants can't
-- be transplanted into Pipedream — so the table is rebuilt and users
-- reconnect through the new flow.
DROP TABLE IF EXISTS mcp_servers;

CREATE TABLE mcp_servers (
    user_id TEXT NOT NULL,
    app_slug TEXT NOT NULL,
    server_name TEXT NOT NULL,
    account_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, app_slug)
);
