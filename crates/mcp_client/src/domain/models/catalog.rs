//! The public catalog of connectable MCP servers.

/// One connectable MCP server advertised in the catalog.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CatalogEntry {
    /// Stable registry identifier, e.g. `app.linear/linear`.
    pub name: String,
    /// Human-readable name to display, e.g. `Linear`.
    pub display_name: String,
    /// One-line description of what connecting the server enables.
    pub description: Option<String>,
    /// The server's streamable HTTP URL — what actually gets connected.
    pub url: String,
    /// URL of the server's icon, when the registry provides one.
    pub icon_url: Option<String>,
    /// Whether this is a curated priority connector, ranked above organic
    /// registry results (and renderable as its own section).
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
