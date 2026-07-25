import { DEV_MODE_ENV } from '@core/constant/featureFlags';
import IconAhrefs from '@icon/mcp-ahrefs.svg';
import IconClay from '@icon/mcp-clay.svg';
import IconCloudflare from '@icon/mcp-cloudflare.svg';
import IconDatadog from '@icon/mcp-datadog.svg';
import IconGithub from '@icon/mcp-github.svg';
import IconGrafana from '@icon/mcp-grafana.svg';
import IconLinear from '@icon/mcp-linear.svg';
import IconMobbin from '@icon/mcp-mobbin.svg';
import IconNotion from '@icon/mcp-notion.svg';
import IconPipeboard from '@icon/mcp-pipeboard.svg';
import IconPostHog from '@icon/mcp-posthog.svg';
import IconProfound from '@icon/mcp-profound.svg';
import IconSlack from '@icon/mcp-slack.svg';
import IconStripe from '@icon/mcp-stripe.svg';
import type { Component, JSX } from 'solid-js';

export type SvgIcon = Component<JSX.SvgSVGAttributes<SVGSVGElement>>;

export const QUICK_CONNECT_SERVERS = [
  {
    server_name: 'GitHub',
    url: 'https://api.githubcopilot.com/mcp',
    icon: IconGithub as SvgIcon,
  },
  {
    server_name: 'Linear',
    url: 'https://mcp.linear.app/mcp',
    icon: IconLinear as SvgIcon,
  },
  // Slack is dev-only until the integration is ready for production.
  ...(DEV_MODE_ENV
    ? ([
        {
          server_name: 'Slack',
          url: 'https://mcp.slack.com/mcp',
          icon: IconSlack as SvgIcon,
        },
      ] as const)
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
  {
    server_name: 'Stripe',
    url: 'https://mcp.stripe.com',
    icon: IconStripe as SvgIcon,
  },
  {
    server_name: 'Cloudflare',
    url: 'https://mcp.cloudflare.com/mcp',
    icon: IconCloudflare as SvgIcon,
  },
  {
    server_name: 'Cloudflare Developer Platform',
    url: 'https://bindings.mcp.cloudflare.com/mcp',
    icon: IconCloudflare as SvgIcon,
  },
  {
    server_name: 'Ahrefs',
    url: 'https://api.ahrefs.com/mcp/mcp',
    icon: IconAhrefs as SvgIcon,
  },
  {
    server_name: 'Clay',
    url: 'https://api.clay.com/v3/mcp',
    icon: IconClay as SvgIcon,
  },
  {
    server_name: 'Profound',
    url: 'https://mcp.tryprofound.com/mcp',
    icon: IconProfound as SvgIcon,
  },
  {
    server_name: 'Mobbin',
    url: 'https://api.mobbin.com/mcp',
    icon: IconMobbin as SvgIcon,
  },
  {
    server_name: 'Pipeboard Google Ads Connector',
    url: 'https://google-ads.mcp.pipeboard.co',
    icon: IconPipeboard as SvgIcon,
  },
  {
    server_name: 'Pipeboard Meta Ads',
    url: 'https://meta-ads.mcp.pipeboard.co',
    icon: IconPipeboard as SvgIcon,
  },
] as const;

export type QuickConnectServer = (typeof QUICK_CONNECT_SERVERS)[number];

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
  ['Stripe', 'Look up payments, customers, and subscriptions.'],
  ['Cloudflare', 'Manage Workers, DNS, and other Cloudflare resources.'],
  ['Cloudflare Developer Platform', 'Manage Workers bindings and deployments.'],
  ['Ahrefs', 'Pull SEO, backlink, and keyword data.'],
  ['Clay', 'Enrich and research records from your GTM data.'],
  ['Profound', 'Track visibility in AI search and answer engines.'],
  ['Mobbin', 'Reference real product design patterns and flows.'],
  [
    'Pipeboard Google Ads Connector',
    'Manage and analyze Google Ads campaigns.',
  ],
  [
    'Pipeboard Meta Ads',
    'Manage and analyze Meta (Facebook/Instagram) ad campaigns.',
  ],
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

const SERVER_NAME_ICON_MAP: Map<string, SvgIcon> = new Map(
  QUICK_CONNECT_SERVERS.map((s) => [s.server_name.toLowerCase(), s.icon])
);

export function getMcpServerIcon(serverName: string): SvgIcon | undefined {
  return SERVER_NAME_ICON_MAP.get(serverName.toLowerCase());
}
