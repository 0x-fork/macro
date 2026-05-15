# HubSpot MCP Provider

HubSpot's MCP server (`https://mcp.hubspot.com`) does not support Dynamic Client Registration.
A pre-registered MCP auth app provides the `client_id` and `client_secret` used by the OAuth flow.

## HubSpot MCP Auth App

**App dashboard**: https://developers.hubspot.com (Development > MCP Auth Apps)

## Environment Variables

| Variable | Description |
|---|---|
| `HUBSPOT_MCP_CLIENT_ID` | OAuth client ID from the HubSpot MCP auth app |
| `HUBSPOT_MCP_CLIENT_SECRET` | OAuth client secret (server-side only, never log) |

Both must be set together or both omitted. If only one is set the service will panic on startup.

## Scopes

HubSpot determines available scopes dynamically based on the MCP server's tools at the time of
installation. The user chooses which permissions to grant during the OAuth flow. The manifest
therefore has an empty scopes list.

## Manifest

`manifest.json` in this directory defines the app configuration (redirect URIs).
Scopes are intentionally empty since HubSpot handles them dynamically.

## Docs

- [HubSpot MCP overview](https://developers.hubspot.com/mcp)
- [Integrate with the remote HubSpot MCP server](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server)
