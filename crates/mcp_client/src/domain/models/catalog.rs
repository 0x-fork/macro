//! The public catalog of connectable MCP apps.

/// One connectable app advertised in the catalog.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CatalogEntry {
    /// Pipedream app name slug, e.g. `linear` — what gets connected.
    pub app_slug: String,
    /// Human-readable name to display, e.g. `Linear`.
    pub display_name: String,
    /// One-line description of what connecting the app enables.
    pub description: Option<String>,
    /// URL of the app's icon, when the directory provides one.
    pub icon_url: Option<String>,
    /// Whether this is a curated priority connector, ranked above organic
    /// directory results (and renderable as its own section).
    pub priority: bool,
}

/// One page of catalog results.
#[derive(Clone, Debug, Default)]
pub struct CatalogPage {
    /// The entries on this page, in display order.
    pub entries: Vec<CatalogEntry>,
    /// Opaque cursor for fetching the next page. `None` on the last page.
    pub next_cursor: Option<String>,
}
