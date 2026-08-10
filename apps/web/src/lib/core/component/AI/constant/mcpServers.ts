import { DEV_MODE_ENV } from '@core/constant/featureFlags';
import IconDatadog from '@icon/mcp-datadog.svg';
import IconGithub from '@icon/mcp-github.svg';
import IconGrafana from '@icon/mcp-grafana.svg';
import IconLinear from '@icon/mcp-linear.svg';
import IconNotion from '@icon/mcp-notion.svg';
import IconPostHog from '@icon/mcp-posthog.svg';
import IconSlack from '@icon/mcp-slack.svg';
import type { Component, JSX } from 'solid-js';

export type SvgIcon = Component<JSX.SvgSVGAttributes<SVGSVGElement>>;

export type QuickConnectServer = {
  server_name: string;
  url: string;
  icon: SvgIcon;
  /**
   * False for servers whose MCP OAuth needs a pre-registered client (no
   * dynamic client registration) — Nango's generic MCP integration can't
   * authorize those, so they connect through the legacy in-house flow.
   */
  supportsNango?: boolean;
};

export const QUICK_CONNECT_SERVERS: readonly QuickConnectServer[] = [
  {
    server_name: 'GitHub',
    url: 'https://api.githubcopilot.com/mcp',
    icon: IconGithub as SvgIcon,
    supportsNango: false,
  },
  {
    server_name: 'Linear',
    url: 'https://mcp.linear.app/mcp',
    icon: IconLinear as SvgIcon,
  },
  // Slack is dev-only until the integration is ready for production.
  ...(DEV_MODE_ENV
    ? [
        {
          server_name: 'Slack',
          url: 'https://mcp.slack.com/mcp',
          icon: IconSlack as SvgIcon,
          supportsNango: false,
        },
      ]
    : []),
  {
    server_name: 'Notion',
    url: 'https://mcp.notion.com/mcp',
    icon: IconNotion as SvgIcon,
  },
  {
    server_name: 'PostHog',
    url: 'https://mcp.posthog.com/mcp',
    icon: IconPostHog as SvgIcon,
  },
  {
    server_name: 'Datadog',
    url: 'https://mcp.datadoghq.com/mcp',
    icon: IconDatadog as SvgIcon,
  },
  {
    server_name: 'Grafana',
    url: 'https://mcp.grafana.com/mcp',
    icon: IconGrafana as SvgIcon,
  },
];

/**
 * Preset servers surfaced directly on the Connections page (with a one-line
 * pitch) to encourage connecting — the only catalog now that the "Add server"
 * dialog is custom-URL only. Ordered by how much we want to promote each;
 * presets absent from {@link QUICK_CONNECT_SERVERS} (e.g. dev-only Slack in
 * production) are dropped automatically.
 */
const FEATURED_SERVER_TAGLINES: [name: string, tagline: string][] = [
  ['Linear', 'Create and update issues without leaving Macro.'],
  ['Slack', 'Search conversations and post updates to channels.'],
  ['Notion', 'Search your pages, databases, and wikis.'],
  ['PostHog', 'Query product analytics and user insights.'],
  ['GitHub', 'Give the agent access to your repos, PRs, and issues.'],
  ['Datadog', 'Query metrics, logs, and monitors.'],
  ['Grafana', 'Search dashboards and query your data sources.'],
];

export type FeaturedMcpServer = QuickConnectServer & { tagline: string };

export const FEATURED_MCP_SERVERS: FeaturedMcpServer[] =
  FEATURED_SERVER_TAGLINES.flatMap(([name, tagline]) => {
    const server = QUICK_CONNECT_SERVERS.find((s) => s.server_name === name);
    return server ? [{ ...server, tagline }] : [];
  });

export const QUICK_CONNECT_ICON_MAP: Map<string, SvgIcon> = new Map(
  QUICK_CONNECT_SERVERS.map((s) => [s.url, s.icon])
);

/**
 * Servers whose MCP OAuth needs a pre-registered client (no dynamic client
 * registration) — Nango's generic MCP integration can't authorize those, so
 * they always take the legacy in-house flow. Kept as a standalone set (not
 * derived from {@link QUICK_CONNECT_SERVERS}) because entries there are
 * environment-gated, while this routing must hold wherever the URL shows up
 * (e.g. the connector catalog).
 */
const NANGO_UNSUPPORTED_URLS = new Set(
  ['https://api.githubcopilot.com/mcp', 'https://mcp.slack.com/mcp'].map(
    (url) => url.replace(/\/+$/, '')
  )
);

/**
 * Whether a server URL can be authorized through Nango. True for anything
 * not in {@link NANGO_UNSUPPORTED_URLS} — custom servers are assumed
 * spec-compliant (dynamic client registration).
 */
export function mcpUrlSupportsNango(url: string): boolean {
  return !NANGO_UNSUPPORTED_URLS.has(url.replace(/\/+$/, ''));
}

/**
 * Whether a catalog connector should be offered in this environment.
 * Mirrors the environment gating in {@link QUICK_CONNECT_SERVERS} (Slack is
 * dev-only until the integration is ready for production).
 */
export function mcpUrlAvailableInEnv(url: string): boolean {
  if (DEV_MODE_ENV) return true;
  return url.replace(/\/+$/, '') !== 'https://mcp.slack.com/mcp';
}

const SERVER_NAME_ICON_MAP: Map<string, SvgIcon> = new Map(
  QUICK_CONNECT_SERVERS.map((s) => [s.server_name.toLowerCase(), s.icon])
);

export function getMcpServerIcon(serverName: string): SvgIcon | undefined {
  return SERVER_NAME_ICON_MAP.get(serverName.toLowerCase());
}
