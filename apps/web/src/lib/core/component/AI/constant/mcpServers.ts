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
  /** Pipedream app name slug, e.g. `linear`. */
  app_slug: string;
  icon: SvgIcon;
};

export const QUICK_CONNECT_SERVERS: readonly QuickConnectServer[] = [
  {
    server_name: 'GitHub',
    app_slug: 'github',
    icon: IconGithub as SvgIcon,
  },
  {
    server_name: 'Linear',
    app_slug: 'linear',
    icon: IconLinear as SvgIcon,
  },
  // Slack is dev-only until the integration is ready for production.
  ...(DEV_MODE_ENV
    ? [
        {
          server_name: 'Slack',
          app_slug: 'slack',
          icon: IconSlack as SvgIcon,
        },
      ]
    : []),
  {
    server_name: 'Notion',
    app_slug: 'notion',
    icon: IconNotion as SvgIcon,
  },
  {
    server_name: 'PostHog',
    app_slug: 'posthog',
    icon: IconPostHog as SvgIcon,
  },
  {
    server_name: 'Datadog',
    app_slug: 'datadog',
    icon: IconDatadog as SvgIcon,
  },
  {
    server_name: 'Grafana',
    app_slug: 'grafana',
    icon: IconGrafana as SvgIcon,
  },
];

/**
 * Preset connectors surfaced directly on the Connections page (with a
 * one-line pitch) to encourage connecting. Ordered by how much we want to
 * promote each; presets absent from {@link QUICK_CONNECT_SERVERS} (e.g.
 * dev-only Slack in production) are dropped automatically. The backend pins
 * the same list at the top of the connector catalog.
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

/** Bundled connector icons, keyed by Pipedream app slug. */
export const QUICK_CONNECT_ICON_MAP: Map<string, SvgIcon> = new Map(
  QUICK_CONNECT_SERVERS.map((s) => [s.app_slug, s.icon])
);

/**
 * Whether a catalog connector should be offered in this environment.
 * Mirrors the environment gating in {@link QUICK_CONNECT_SERVERS} (Slack is
 * dev-only until the integration is ready for production).
 */
export function mcpAppAvailableInEnv(appSlug: string): boolean {
  if (DEV_MODE_ENV) return true;
  return appSlug !== 'slack';
}

const SERVER_NAME_ICON_MAP: Map<string, SvgIcon> = new Map(
  QUICK_CONNECT_SERVERS.map((s) => [s.server_name.toLowerCase(), s.icon])
);

export function getMcpServerIcon(serverName: string): SvgIcon | undefined {
  return SERVER_NAME_ICON_MAP.get(serverName.toLowerCase());
}
