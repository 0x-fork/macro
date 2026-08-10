use crate::domain::models::{CatalogEntry, CatalogPage};
use crate::domain::ports::McpRegistry;
use anyhow::Context;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// How long a registry page is served from cache. The registry is public,
/// slow-moving data; short caching keeps typeahead search snappy without
/// hammering it.
const PAGE_TTL: Duration = Duration::from_secs(5 * 60);

/// Cache size guard — beyond this many distinct queries the cache resets
/// rather than growing unboundedly.
const MAX_CACHED_PAGES: usize = 256;

/// Default base URL of the official MCP registry.
pub const DEFAULT_REGISTRY_URL: &str = "https://registry.modelcontextprotocol.io";

/// HTTP [`McpRegistry`] adapter against the official MCP registry API
/// (`GET /v0/servers`), with an in-memory TTL cache per query.
pub struct McpRegistryClient {
    http: reqwest::Client,
    base_url: String,
    cache: Mutex<HashMap<String, CachedPage>>,
}

struct CachedPage {
    page: CatalogPage,
    fetched_at: Instant,
}

impl McpRegistryClient {
    /// Build a client for the registry at `base_url` (see
    /// [`DEFAULT_REGISTRY_URL`]). Fails only if the underlying HTTP client
    /// can't be constructed.
    pub fn new(base_url: String) -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .context("building MCP registry HTTP client")?;
        Ok(Self {
            http,
            base_url,
            cache: Mutex::new(HashMap::new()),
        })
    }

    fn cached(&self, key: &str) -> Option<CatalogPage> {
        let cache = self.cache.lock().unwrap();
        cache
            .get(key)
            .filter(|entry| entry.fetched_at.elapsed() < PAGE_TTL)
            .map(|entry| entry.page.clone())
    }

    fn store(&self, key: String, page: CatalogPage) {
        let mut cache = self.cache.lock().unwrap();
        if cache.len() >= MAX_CACHED_PAGES {
            cache.retain(|_, entry| entry.fetched_at.elapsed() < PAGE_TTL);
            if cache.len() >= MAX_CACHED_PAGES {
                cache.clear();
            }
        }
        cache.insert(
            key,
            CachedPage {
                page,
                fetched_at: Instant::now(),
            },
        );
    }
}

impl McpRegistry for McpRegistryClient {
    #[tracing::instrument(skip(self), err)]
    async fn search(
        &self,
        search: Option<&str>,
        cursor: Option<&str>,
        limit: u32,
    ) -> anyhow::Result<CatalogPage> {
        let key = format!(
            "{}\x1f{}\x1f{limit}",
            search.unwrap_or_default(),
            cursor.unwrap_or_default()
        );
        if let Some(page) = self.cached(&key) {
            return Ok(page);
        }

        let mut query: Vec<(&str, String)> = vec![
            ("version", "latest".to_owned()),
            ("limit", limit.to_string()),
        ];
        if let Some(search) = search {
            query.push(("search", search.to_owned()));
        }
        if let Some(cursor) = cursor {
            query.push(("cursor", cursor.to_owned()));
        }

        let response = self
            .http
            .get(format!(
                "{}/v0/servers",
                self.base_url.trim_end_matches('/')
            ))
            .query(&query)
            .send()
            .await
            .context("querying MCP registry")?
            .error_for_status()
            .context("MCP registry returned an error")?;

        let body: ServersResponse = response
            .json()
            .await
            .context("decoding MCP registry response")?;

        let entries = body
            .servers
            .into_iter()
            .filter(|s| s.meta.official.as_ref().is_none_or(|o| o.is_active()))
            .filter_map(|s| s.server.into_entry())
            .collect();

        let page = CatalogPage {
            entries,
            next_cursor: body.metadata.and_then(|m| m.next_cursor),
        };
        self.store(key, page.clone());
        Ok(page)
    }
}

// -- wire types ---------------------------------------------------------------

#[derive(Deserialize)]
struct ServersResponse {
    servers: Vec<ServerEnvelope>,
    metadata: Option<ResponseMetadata>,
}

#[derive(Deserialize)]
struct ResponseMetadata {
    #[serde(rename = "nextCursor")]
    next_cursor: Option<String>,
}

#[derive(Deserialize)]
struct ServerEnvelope {
    server: RegistryServer,
    #[serde(rename = "_meta", default)]
    meta: EnvelopeMeta,
}

#[derive(Deserialize, Default)]
struct EnvelopeMeta {
    #[serde(rename = "io.modelcontextprotocol.registry/official")]
    official: Option<OfficialMeta>,
}

#[derive(Deserialize)]
struct OfficialMeta {
    status: Option<String>,
}

impl OfficialMeta {
    fn is_active(&self) -> bool {
        self.status.as_deref().is_none_or(|s| s == "active")
    }
}

#[derive(Deserialize)]
struct RegistryServer {
    name: String,
    title: Option<String>,
    description: Option<String>,
    #[serde(default)]
    remotes: Vec<Remote>,
    #[serde(default)]
    icons: Vec<Icon>,
}

#[derive(Deserialize)]
struct Remote {
    #[serde(rename = "type")]
    kind: String,
    url: String,
}

#[derive(Deserialize)]
struct Icon {
    src: String,
}

impl RegistryServer {
    /// Convert to a catalog entry, or `None` when the server has no
    /// streamable HTTP remote (i.e. nothing we could connect to).
    fn into_entry(self) -> Option<CatalogEntry> {
        let url = self
            .remotes
            .iter()
            .find(|r| r.kind == "streamable-http")
            .map(|r| r.url.clone())?;

        // Registry names are reverse-DNS ids like `app.linear/linear`; the
        // segment after the slash is the human-meaningful part.
        let display_name = self
            .title
            .clone()
            .filter(|t| !t.trim().is_empty())
            .or_else(|| self.name.rsplit('/').next().map(str::to_owned))
            .unwrap_or_else(|| self.name.clone());

        let icon_url = self
            .icons
            .iter()
            .map(|icon| icon.src.clone())
            .find(|src| src.starts_with("https://"));

        Some(CatalogEntry {
            name: self.name,
            display_name,
            description: self.description,
            url,
            icon_url,
            priority: false,
        })
    }
}
