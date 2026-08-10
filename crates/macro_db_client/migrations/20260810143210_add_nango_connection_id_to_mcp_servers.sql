-- MCP server authorization via Nango: servers connected through Nango store
-- the Nango connection ID instead of encrypted OAuth credentials. Tokens are
-- fetched fresh from Nango at connect time (Nango owns storage and refresh),
-- so rows with a nango_connection_id keep `credentials` NULL.
ALTER TABLE mcp_servers
    ADD COLUMN nango_connection_id TEXT;
