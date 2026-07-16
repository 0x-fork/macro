//! Domain models and value objects for documentation sites.

#[cfg(test)]
mod test;

use chrono::{DateTime, Utc};

/// Maximum length of a site slug.
const SITE_SLUG_MAX_LEN: usize = 63;
/// Minimum length of a site slug.
const SITE_SLUG_MIN_LEN: usize = 2;
/// Maximum length of a single page-path segment.
const PAGE_PATH_SEGMENT_MAX_LEN: usize = 64;
/// Maximum number of segments in a page path.
const PAGE_PATH_MAX_SEGMENTS: usize = 8;
/// Maximum length of a custom domain.
const CUSTOM_DOMAIN_MAX_LEN: usize = 253;
/// Maximum length of a site or nav node title.
pub const TITLE_MAX_LEN: usize = 120;

/// A validated documentation site slug: the site's globally-unique public
/// URL segment (`https://<docs host>/<slug>/...`). Lowercase alphanumerics
/// and hyphens, no leading/trailing hyphen.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(transparent)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "axum", schema(value_type = String))]
pub struct SiteSlug(String);

impl SiteSlug {
    /// Validates and wraps a raw slug.
    pub fn new(raw: &str) -> Result<Self, DocumentationError> {
        let valid_len = (SITE_SLUG_MIN_LEN..=SITE_SLUG_MAX_LEN).contains(&raw.len());
        let valid_chars = raw
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
        let valid_edges = !raw.starts_with('-') && !raw.ends_with('-');
        if !(valid_len && valid_chars && valid_edges) {
            return Err(DocumentationError::InvalidSlug(raw.to_string()));
        }
        Ok(Self(raw.to_string()))
    }

    /// Derives a slug from a human-readable name (e.g. a site name),
    /// lowercasing and replacing runs of non-alphanumerics with hyphens.
    /// Returns `None` when nothing usable remains.
    pub fn from_name(name: &str) -> Option<Self> {
        let slug = slugify(name, SITE_SLUG_MAX_LEN);
        if slug.len() < SITE_SLUG_MIN_LEN {
            return None;
        }
        Self::new(&slug).ok()
    }

    /// Wraps an already-validated slug read back from storage.
    pub(crate) fn from_trusted(raw: String) -> Self {
        Self(raw)
    }

    /// The slug as a string slice.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for SiteSlug {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// A validated page path within a site: one to eight slug segments joined
/// by `/` (e.g. `getting-started` or `product/email`). Forms the page's
/// public URL under the site root.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(transparent)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "axum", schema(value_type = String))]
pub struct PagePath(String);

impl PagePath {
    /// Validates and wraps a raw page path.
    pub fn new(raw: &str) -> Result<Self, DocumentationError> {
        let segments: Vec<&str> = raw.split('/').collect();
        let valid = !segments.is_empty()
            && segments.len() <= PAGE_PATH_MAX_SEGMENTS
            && segments.iter().all(|segment| {
                !segment.is_empty()
                    && segment.len() <= PAGE_PATH_SEGMENT_MAX_LEN
                    && !segment.starts_with('-')
                    && !segment.ends_with('-')
                    && segment
                        .chars()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
            });
        if !valid {
            return Err(DocumentationError::InvalidPath(raw.to_string()));
        }
        Ok(Self(raw.to_string()))
    }

    /// Derives a single-segment page path from a human-readable title.
    /// Returns `None` when nothing usable remains.
    pub fn from_title(title: &str) -> Option<Self> {
        let slug = slugify(title, PAGE_PATH_SEGMENT_MAX_LEN);
        if slug.is_empty() {
            return None;
        }
        Self::new(&slug).ok()
    }

    /// Wraps an already-validated path read back from storage.
    pub(crate) fn from_trusted(raw: String) -> Self {
        Self(raw)
    }

    /// The path as a string slice.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// The number of `/`-separated segments in the path.
    pub fn depth(&self) -> usize {
        self.0.split('/').count()
    }
}

impl std::fmt::Display for PagePath {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// A validated custom domain for a site (e.g. `docs.macro.com`):
/// a lowercase hostname with at least two labels.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(transparent)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "axum", schema(value_type = String))]
pub struct CustomDomain(String);

impl CustomDomain {
    /// Validates and wraps a raw domain name.
    pub fn new(raw: &str) -> Result<Self, DocumentationError> {
        let labels: Vec<&str> = raw.split('.').collect();
        let valid = raw.len() <= CUSTOM_DOMAIN_MAX_LEN
            && labels.len() >= 2
            && labels.iter().all(|label| {
                !label.is_empty()
                    && label.len() <= 63
                    && !label.starts_with('-')
                    && !label.ends_with('-')
                    && label
                        .chars()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
            });
        if !valid {
            return Err(DocumentationError::InvalidDomain(raw.to_string()));
        }
        Ok(Self(raw.to_string()))
    }

    /// Wraps an already-validated domain read back from storage.
    pub(crate) fn from_trusted(raw: String) -> Self {
        Self(raw)
    }

    /// The domain as a string slice.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for CustomDomain {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Lowercases `input` and collapses runs of non-alphanumerics into single
/// hyphens, truncating to `max_len` and trimming edge hyphens.
fn slugify(input: &str, max_len: usize) -> String {
    let mut slug = String::with_capacity(input.len());
    let mut last_was_hyphen = true; // suppress leading hyphen
    for c in input.chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
            last_was_hyphen = false;
        } else if !last_was_hyphen {
            slug.push('-');
            last_was_hyphen = true;
        }
        if slug.len() >= max_len {
            break;
        }
    }
    slug.trim_matches('-').to_string()
}

/// A documentation site: a team-owned, published collection of markdown
/// documents.
#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
pub struct DocumentationSite {
    /// The site id.
    pub id: uuid::Uuid,
    /// The owning team.
    pub team_id: uuid::Uuid,
    /// The user who created the site.
    pub user_id: String,
    /// The site's display name.
    pub name: String,
    /// The site's globally-unique public URL segment.
    pub slug: SiteSlug,
    /// Optional custom domain the site is additionally served from.
    pub custom_domain: Option<CustomDomain>,
    /// When the site was last successfully published, if ever.
    pub published_at: Option<DateTime<Utc>>,
    /// When the site was created.
    pub created_at: DateTime<Utc>,
    /// When the site was last updated.
    pub updated_at: DateTime<Utc>,
}

/// The kind of a nav tree node.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "outbound",
    derive(sqlx::Type),
    sqlx(type_name = "documentation_nav_node_kind", rename_all = "snake_case")
)]
pub enum NavNodeKind {
    /// A display-only section label that groups child nodes.
    Group,
    /// A page: binds a URL path within the site to a markdown document.
    Page,
}

/// One node of a site's nav tree.
#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
pub struct NavNode {
    /// The node id.
    pub id: uuid::Uuid,
    /// The owning site.
    pub site_id: uuid::Uuid,
    /// The parent group, or `None` for a top-level node.
    pub parent_id: Option<uuid::Uuid>,
    /// Whether this node is a group or a page.
    pub kind: NavNodeKind,
    /// The display title shown in the site's sidebar.
    pub title: String,
    /// The page's URL path under the site root (pages only).
    pub path: Option<PagePath>,
    /// The backing markdown document (pages only).
    pub document_id: Option<String>,
    /// 0-based position among siblings.
    pub position: i32,
}

/// A nav node with its resolved children, forming the site's nav tree.
#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
pub struct NavTreeNode {
    /// The node itself.
    #[serde(flatten)]
    pub node: NavNode,
    /// The node's ordered children (groups only; empty for pages).
    // `no_recursion` breaks the schema-generation cycle for this
    // self-referential type — without it `ApiDoc::openapi()` recurses
    // infinitely and overflows the stack.
    #[cfg_attr(feature = "axum", schema(no_recursion))]
    pub children: Vec<NavTreeNode>,
}

/// Assembles a flat, position-ordered node list into a tree. Nodes whose
/// parent is missing are lifted to the top level so a stray row can never
/// make pages disappear from the editor.
pub fn build_nav_tree(mut nodes: Vec<NavNode>) -> Vec<NavTreeNode> {
    nodes.sort_by_key(|n| n.position);
    let ids: std::collections::HashSet<uuid::Uuid> = nodes.iter().map(|n| n.id).collect();
    let mut children_of: std::collections::HashMap<uuid::Uuid, Vec<NavNode>> =
        std::collections::HashMap::new();
    let mut roots: Vec<NavNode> = Vec::new();

    for node in nodes {
        match node.parent_id {
            Some(parent_id) if ids.contains(&parent_id) => {
                children_of.entry(parent_id).or_default().push(node);
            }
            _ => roots.push(node),
        }
    }

    fn attach(
        node: NavNode,
        children_of: &mut std::collections::HashMap<uuid::Uuid, Vec<NavNode>>,
    ) -> NavTreeNode {
        let children = children_of
            .remove(&node.id)
            .unwrap_or_default()
            .into_iter()
            .map(|child| attach(child, children_of))
            .collect();
        NavTreeNode { node, children }
    }

    roots
        .into_iter()
        .map(|node| attach(node, &mut children_of))
        .collect()
}

/// The status of a site publish.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "outbound",
    derive(sqlx::Type),
    sqlx(type_name = "documentation_build_status", rename_all = "snake_case")
)]
pub enum BuildStatus {
    /// Created, not yet picked up.
    Pending,
    /// Rendering and uploading.
    InProgress,
    /// Published successfully.
    Succeeded,
    /// Failed; see the build's `error`.
    Failed,
}

/// One publish of a site.
#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
pub struct SiteBuild {
    /// The build id.
    pub id: uuid::Uuid,
    /// The site this build publishes.
    pub site_id: uuid::Uuid,
    /// The user who triggered the publish.
    pub user_id: String,
    /// The build's current status.
    pub status: BuildStatus,
    /// The failure message, when `status` is `failed`.
    pub error: Option<String>,
    /// Number of pages rendered, when the build got that far.
    pub page_count: Option<i32>,
    /// When the build was created.
    pub created_at: DateTime<Utc>,
    /// When the build reached a terminal status.
    pub finished_at: Option<DateTime<Utc>>,
}

impl SiteBuild {
    /// Whether the build is still pending or running.
    pub fn is_running(&self) -> bool {
        matches!(self.status, BuildStatus::Pending | BuildStatus::InProgress)
    }
}

/// Availability of the Documentation feature for a team.
#[derive(Debug, Clone, Copy, serde::Serialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
pub struct DocumentationAvailability {
    /// Whether the team satisfies the team-plan requirement.
    pub plan_ok: bool,
    /// Whether the team-level Documentation toggle is on.
    pub enabled: bool,
}

impl DocumentationAvailability {
    /// Whether documentation site operations are allowed.
    pub fn available(&self) -> bool {
        self.plan_ok && self.enabled
    }
}

/// Arguments for creating a documentation site.
#[derive(Debug, Clone)]
pub struct CreateSiteArgs {
    /// The site's display name.
    pub name: String,
    /// Explicit slug; derived from `name` when omitted.
    pub slug: Option<String>,
}

/// Arguments for updating a documentation site.
#[derive(Debug, Clone)]
pub struct UpdateSiteArgs {
    /// New display name, if changing.
    pub name: Option<String>,
    /// New slug, if changing. Changing the slug moves the site's public
    /// URL; the old location is pruned on the next publish.
    pub slug: Option<String>,
}

/// Arguments for creating a nav node.
#[derive(Debug, Clone)]
pub struct CreateNavNodeArgs {
    /// Whether to create a group or a page.
    pub kind: NavNodeKind,
    /// The display title.
    pub title: String,
    /// Parent group id, or `None` for top level.
    pub parent_id: Option<uuid::Uuid>,
    /// The page's URL path; derived from `title` when omitted (pages only).
    pub path: Option<String>,
    /// The backing markdown document (pages only).
    pub document_id: Option<String>,
}

/// Arguments for updating a nav node's title/path.
#[derive(Debug, Clone)]
pub struct UpdateNavNodeArgs {
    /// New title, if changing.
    pub title: Option<String>,
    /// New URL path, if changing (pages only).
    pub path: Option<String>,
}

/// A site with its assembled nav tree and most recent build.
#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "axum", derive(utoipa::ToSchema))]
pub struct SiteDetail {
    /// The site.
    pub site: DocumentationSite,
    /// The site's nav tree, ordered.
    pub nav: Vec<NavTreeNode>,
    /// The most recent build, if any.
    pub latest_build: Option<SiteBuild>,
}

/// Errors returned by the documentation domain.
#[derive(Debug, thiserror::Error)]
pub enum DocumentationError {
    /// The team's plan does not include the Documentation feature.
    #[error("documentation requires a team plan")]
    TeamPlanRequired,
    /// The Documentation feature is not enabled for the team.
    #[error("documentation is not enabled for this team")]
    NotEnabled,
    /// The site does not exist (or belongs to another team).
    #[error("documentation site not found")]
    SiteNotFound,
    /// The nav node does not exist (or belongs to another site).
    #[error("nav node not found")]
    NodeNotFound,
    /// The build does not exist.
    #[error("build not found")]
    BuildNotFound,
    /// The requested slug is already in use by another site.
    #[error("slug is already taken")]
    SlugTaken,
    /// The requested page path is already in use within the site.
    #[error("page path is already taken")]
    PathTaken,
    /// The requested custom domain is already in use by another site.
    #[error("custom domain is already taken")]
    DomainTaken,
    /// The slug is not a valid site slug.
    #[error("invalid slug: {0}")]
    InvalidSlug(String),
    /// The path is not a valid page path.
    #[error("invalid page path: {0}")]
    InvalidPath(String),
    /// The domain is not a valid hostname.
    #[error("invalid custom domain: {0}")]
    InvalidDomain(String),
    /// The referenced document is missing, deleted, or not a markdown doc.
    #[error("document not usable as a documentation page: {0}")]
    DocumentNotUsable(String),
    /// A build is already running for the site.
    #[error("a publish is already in progress for this site")]
    BuildInProgress,
    /// The site has no pages to publish.
    #[error("site has no pages to publish")]
    NoPages,
    /// The request is structurally invalid.
    #[error("bad request: {0}")]
    BadRequest(String),
    /// An internal error occurred.
    #[error("internal documentation error: {0:?}")]
    Internal(rootcause::Report),
}

impl From<rootcause::Report> for DocumentationError {
    fn from(report: rootcause::Report) -> Self {
        DocumentationError::Internal(report)
    }
}
