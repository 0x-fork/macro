//! Ports (traits) required by the documentation domain.

use crate::domain::model::{
    CustomDomain, DocumentationAvailability, DocumentationError, DocumentationSite, NavNode,
    PagePath, SiteBuild, SiteSlug,
};

/// Repository for documentation sites, nav nodes, and builds.
pub trait DocumentationRepository: Clone + Send + Sync + 'static {
    /// Persists a new site. Maps a slug uniqueness violation to
    /// [`DocumentationError::SlugTaken`].
    fn create_site(
        &self,
        site: &DocumentationSite,
    ) -> impl Future<Output = Result<(), DocumentationError>> + Send;

    /// Fetches a site by id, or `None` when it does not exist.
    fn get_site(
        &self,
        site_id: &uuid::Uuid,
    ) -> impl Future<Output = Result<Option<DocumentationSite>, DocumentationError>> + Send;

    /// Lists a team's sites, newest first.
    fn list_sites_for_team(
        &self,
        team_id: &uuid::Uuid,
    ) -> impl Future<Output = Result<Vec<DocumentationSite>, DocumentationError>> + Send;

    /// Updates a site's name and/or slug, returning the updated site. Maps
    /// a slug uniqueness violation to [`DocumentationError::SlugTaken`].
    fn update_site(
        &self,
        site_id: &uuid::Uuid,
        name: Option<&str>,
        slug: Option<&SiteSlug>,
    ) -> impl Future<Output = Result<DocumentationSite, DocumentationError>> + Send;

    /// Sets or clears a site's custom domain, returning the updated site.
    /// Maps a domain uniqueness violation to
    /// [`DocumentationError::DomainTaken`].
    fn set_custom_domain(
        &self,
        site_id: &uuid::Uuid,
        domain: Option<&CustomDomain>,
    ) -> impl Future<Output = Result<DocumentationSite, DocumentationError>> + Send;

    /// Deletes a site (nav nodes and builds cascade).
    fn delete_site(
        &self,
        site_id: &uuid::Uuid,
    ) -> impl Future<Output = Result<(), DocumentationError>> + Send;

    /// Stamps the site's `published_at` after a successful publish.
    fn set_site_published_at(
        &self,
        site_id: &uuid::Uuid,
        published_at: chrono::DateTime<chrono::Utc>,
    ) -> impl Future<Output = Result<(), DocumentationError>> + Send;

    /// Lists all nav nodes of a site (unordered; callers sort by position).
    fn list_nav_nodes(
        &self,
        site_id: &uuid::Uuid,
    ) -> impl Future<Output = Result<Vec<NavNode>, DocumentationError>> + Send;

    /// Persists a new nav node at the end of its sibling list. Maps a page
    /// path uniqueness violation to [`DocumentationError::PathTaken`].
    fn create_nav_node(
        &self,
        node: &NavNode,
    ) -> impl Future<Output = Result<NavNode, DocumentationError>> + Send;

    /// Updates a nav node's title and/or path, returning the updated node.
    /// Maps a page path uniqueness violation to
    /// [`DocumentationError::PathTaken`].
    fn update_nav_node(
        &self,
        site_id: &uuid::Uuid,
        node_id: &uuid::Uuid,
        title: Option<&str>,
        path: Option<&PagePath>,
    ) -> impl Future<Output = Result<NavNode, DocumentationError>> + Send;

    /// Moves a nav node to a new parent and/or position, renumbering
    /// affected siblings transactionally.
    fn move_nav_node(
        &self,
        site_id: &uuid::Uuid,
        node_id: &uuid::Uuid,
        new_parent_id: Option<&uuid::Uuid>,
        new_position: i32,
    ) -> impl Future<Output = Result<(), DocumentationError>> + Send;

    /// Deletes a nav node (children cascade).
    fn delete_nav_node(
        &self,
        site_id: &uuid::Uuid,
        node_id: &uuid::Uuid,
    ) -> impl Future<Output = Result<(), DocumentationError>> + Send;

    /// Whether the document exists, is not deleted, and is a markdown doc —
    /// i.e. usable as a documentation page.
    fn document_usable_as_page(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<bool, DocumentationError>> + Send;

    /// Persists a new build row.
    fn create_build(
        &self,
        build: &SiteBuild,
    ) -> impl Future<Output = Result<(), DocumentationError>> + Send;

    /// Fetches the most recent build for a site, if any.
    fn get_latest_build(
        &self,
        site_id: &uuid::Uuid,
    ) -> impl Future<Output = Result<Option<SiteBuild>, DocumentationError>> + Send;

    /// Marks a build in progress.
    fn mark_build_in_progress(
        &self,
        build_id: &uuid::Uuid,
    ) -> impl Future<Output = Result<(), DocumentationError>> + Send;

    /// Marks a build succeeded with the number of pages rendered.
    fn mark_build_succeeded(
        &self,
        build_id: &uuid::Uuid,
        page_count: i32,
    ) -> impl Future<Output = Result<(), DocumentationError>> + Send;

    /// Marks a build failed with a human-readable error.
    fn mark_build_failed(
        &self,
        build_id: &uuid::Uuid,
        error: &str,
    ) -> impl Future<Output = Result<(), DocumentationError>> + Send;
}

/// Source of the markdown content backing a documentation page.
pub trait PageContentSource: Clone + Send + Sync + 'static {
    /// Exports the document's content as GitHub-flavored markdown.
    fn get_markdown(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<String, rootcause::Report>> + Send;
}

/// A single file of a rendered static site.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedFile {
    /// Path relative to the site root, e.g. `getting-started/index.html`.
    pub path: String,
    /// The file's MIME type.
    pub content_type: &'static str,
    /// The file's bytes.
    pub content: Vec<u8>,
}

/// Storage for published static sites.
pub trait PublishedSiteStore: Clone + Send + Sync + 'static {
    /// Uploads the rendered site under the slug's prefix and prunes files
    /// from a previous publish that are no longer part of the site.
    fn publish(
        &self,
        slug: &SiteSlug,
        files: &[RenderedFile],
    ) -> impl Future<Output = Result<(), rootcause::Report>> + Send;

    /// Removes every published file under the slug's prefix.
    fn remove(&self, slug: &SiteSlug)
    -> impl Future<Output = Result<(), rootcause::Report>> + Send;
}

/// Gate deciding whether the Documentation feature is available to a team.
pub trait DocumentationGate: Clone + Send + Sync + 'static {
    /// Reports the team's Documentation availability (team-plan check and
    /// team-level toggle).
    fn availability(
        &self,
        team_id: &uuid::Uuid,
    ) -> impl Future<Output = Result<DocumentationAvailability, rootcause::Report>> + Send;
}
