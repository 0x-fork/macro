//! Browsing the catalog of connectable MCP servers.
//!
//! The catalog merges two sources: a curated list of priority connectors we
//! actively promote, and the public MCP registry. Priority connectors rank
//! above organic registry results (clients may also render them as their own
//! section, via [`CatalogEntry::priority`]).

use crate::domain::models::{CatalogEntry, CatalogPage};
use crate::domain::ports::McpRegistry;

#[cfg(test)]
mod test;

/// A curated connector we promote above organic registry results.
struct PriorityConnector {
    /// Registry identifier, used to dedupe against registry results.
    name: &'static str,
    display_name: &'static str,
    /// Product-voice tagline shown instead of the registry's description.
    tagline: &'static str,
    url: &'static str,
    icon_url: Option<&'static str>,
}

/// The promoted connectors, in the order they should rank.
///
/// This is the place to "advertise" a connector: entries here are pinned to
/// the top of the catalog (or shown in a dedicated featured section) whether
/// or not the registry lists them.
const PRIORITY_CONNECTORS: &[PriorityConnector] = &[
    PriorityConnector {
        name: "app.linear/linear",
        display_name: "Linear",
        tagline: "Create and update issues without leaving Macro.",
        url: "https://mcp.linear.app/mcp",
        icon_url: None,
    },
    PriorityConnector {
        name: "com.slack/slack",
        display_name: "Slack",
        tagline: "Search conversations and post updates to channels.",
        url: "https://mcp.slack.com/mcp",
        icon_url: None,
    },
    PriorityConnector {
        name: "com.notion/mcp",
        display_name: "Notion",
        tagline: "Search your pages, databases, and wikis.",
        url: "https://mcp.notion.com/mcp",
        icon_url: None,
    },
    PriorityConnector {
        name: "io.github.PostHog/mcp",
        display_name: "PostHog",
        tagline: "Query product analytics and user insights.",
        url: "https://mcp.posthog.com/mcp",
        icon_url: None,
    },
    PriorityConnector {
        name: "com.github/github-mcp-server",
        display_name: "GitHub",
        tagline: "Give the agent access to your repos, PRs, and issues.",
        url: "https://api.githubcopilot.com/mcp",
        icon_url: None,
    },
    PriorityConnector {
        name: "com.datadoghq/datadog",
        display_name: "Datadog",
        tagline: "Query metrics, logs, and monitors.",
        url: "https://mcp.datadoghq.com/mcp",
        icon_url: None,
    },
    PriorityConnector {
        name: "io.github.grafana/mcp-grafana",
        display_name: "Grafana",
        tagline: "Search dashboards and query your data sources.",
        url: "https://mcp.grafana.com/mcp",
        icon_url: None,
    },
];

/// Bounds for the page size, applied to whatever the client asks for.
const MAX_PAGE_SIZE: u32 = 50;
const DEFAULT_PAGE_SIZE: u32 = 20;

/// Two URLs count as the same server if they differ only by a trailing slash.
fn urls_match(a: &str, b: &str) -> bool {
    a.trim_end_matches('/') == b.trim_end_matches('/')
}

fn matches_priority(entry: &CatalogEntry) -> bool {
    PRIORITY_CONNECTORS
        .iter()
        .any(|p| p.name == entry.name || urls_match(p.url, &entry.url))
}

fn priority_entry(connector: &PriorityConnector) -> CatalogEntry {
    CatalogEntry {
        name: connector.name.to_owned(),
        display_name: connector.display_name.to_owned(),
        description: Some(connector.tagline.to_owned()),
        url: connector.url.to_owned(),
        icon_url: connector.icon_url.map(str::to_owned),
        priority: true,
    }
}

/// Browse the connector catalog: curated priority connectors first, then
/// organic registry results, deduplicated.
///
/// Priority connectors matching `search` (or all of them, when browsing) are
/// pinned to the front of the first page; registry entries duplicating a
/// priority connector are dropped on every page so they never show up twice.
#[tracing::instrument(skip(registry), err)]
pub async fn browse_catalog<R: McpRegistry>(
    registry: &R,
    search: Option<&str>,
    cursor: Option<&str>,
    limit: Option<u32>,
) -> anyhow::Result<CatalogPage> {
    let search = search.map(str::trim).filter(|s| !s.is_empty());
    let limit = limit.unwrap_or(DEFAULT_PAGE_SIZE).clamp(1, MAX_PAGE_SIZE);

    let mut page = registry.search(search, cursor, limit).await?;
    page.entries.retain(|entry| !matches_priority(entry));

    // Priority connectors lead the first page only; on later pages they'd be
    // repeats of what the client already has.
    if cursor.is_none() {
        let needle = search.map(str::to_lowercase);
        let pinned = PRIORITY_CONNECTORS
            .iter()
            .filter(|p| match &needle {
                Some(needle) => {
                    p.display_name.to_lowercase().contains(needle)
                        || p.name.to_lowercase().contains(needle)
                }
                None => true,
            })
            .map(priority_entry);
        page.entries.splice(0..0, pinned);
    }

    Ok(page)
}
