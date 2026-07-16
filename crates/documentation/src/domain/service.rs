//! The documentation service: use-case orchestration and policy.

#[cfg(test)]
mod test;

use std::collections::BTreeMap;

use entity_access::domain::models::{
    AdminTeamRole, EntityAccessReceipt, MemberTeamRole, ViewAccessLevel,
};

use crate::domain::{
    model::{
        BuildStatus, CreateNavNodeArgs, CreateSiteArgs, CustomDomain, DocumentationAvailability,
        DocumentationError, DocumentationSite, NavNode, NavNodeKind, NavTreeNode, PagePath,
        SiteBuild, SiteDetail, SiteSlug, TITLE_MAX_LEN, UpdateNavNodeArgs, UpdateSiteArgs,
        build_nav_tree,
    },
    ports::{DocumentationGate, DocumentationRepository, PageContentSource, PublishedSiteStore},
    ssg::{RenderSiteInput, render_site},
};

/// A build that has been running longer than this is considered abandoned
/// (e.g. the service restarted mid-publish) and no longer blocks a new one.
const STALE_BUILD_AFTER: chrono::Duration = chrono::Duration::minutes(10);

/// The documentation service exposed to inbound adapters.
pub trait DocumentationService: Send + Sync + 'static {
    /// Reports the caller team's Documentation availability.
    fn get_availability(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
    ) -> impl Future<Output = Result<DocumentationAvailability, DocumentationError>> + Send;

    /// Lists the caller team's sites.
    fn list_sites(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
    ) -> impl Future<Output = Result<Vec<DocumentationSite>, DocumentationError>> + Send;

    /// Creates a site for the caller's team.
    fn create_site(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        args: CreateSiteArgs,
    ) -> impl Future<Output = Result<DocumentationSite, DocumentationError>> + Send;

    /// Fetches a site with its nav tree and latest build.
    fn get_site(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
    ) -> impl Future<Output = Result<SiteDetail, DocumentationError>> + Send;

    /// Updates a site's name/slug.
    fn update_site(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
        args: UpdateSiteArgs,
    ) -> impl Future<Output = Result<DocumentationSite, DocumentationError>> + Send;

    /// Deletes a site and removes its published output. Admin-gated.
    fn delete_site(
        &self,
        receipt: EntityAccessReceipt<AdminTeamRole>,
        site_id: uuid::Uuid,
    ) -> impl Future<Output = Result<(), DocumentationError>> + Send;

    /// Sets or clears a site's custom domain. Admin-gated.
    fn set_custom_domain(
        &self,
        receipt: EntityAccessReceipt<AdminTeamRole>,
        site_id: uuid::Uuid,
        domain: Option<String>,
    ) -> impl Future<Output = Result<DocumentationSite, DocumentationError>> + Send;

    /// Adds a nav node (group or page) to a site. Pages must carry a
    /// document receipt proving the caller can read the backing document.
    fn create_nav_node(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
        args: CreateNavNodeArgs,
        document_receipt: Option<EntityAccessReceipt<ViewAccessLevel>>,
    ) -> impl Future<Output = Result<NavNode, DocumentationError>> + Send;

    /// Updates a nav node's title/path.
    fn update_nav_node(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
        node_id: uuid::Uuid,
        args: UpdateNavNodeArgs,
    ) -> impl Future<Output = Result<NavNode, DocumentationError>> + Send;

    /// Moves a nav node to a new parent and/or position.
    fn move_nav_node(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
        node_id: uuid::Uuid,
        new_parent_id: Option<uuid::Uuid>,
        new_position: i32,
    ) -> impl Future<Output = Result<(), DocumentationError>> + Send;

    /// Deletes a nav node (children cascade).
    fn delete_nav_node(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
        node_id: uuid::Uuid,
    ) -> impl Future<Output = Result<(), DocumentationError>> + Send;

    /// Starts a publish. Returns the created build; rendering and upload
    /// run in the background — poll [`Self::get_latest_build`].
    fn publish_site(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
    ) -> impl Future<Output = Result<SiteBuild, DocumentationError>> + Send;

    /// Fetches the site's most recent build.
    fn get_latest_build(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
    ) -> impl Future<Output = Result<Option<SiteBuild>, DocumentationError>> + Send;

    /// The public URL a site is served from.
    fn site_public_url(&self, site: &DocumentationSite) -> String;
}

/// Implementation of [`DocumentationService`].
#[derive(Debug)]
pub struct DocumentationServiceImpl<R, C, S, G> {
    repo: R,
    content_source: C,
    site_store: S,
    gate: G,
    /// Base URL of the shared docs host (no trailing slash), e.g.
    /// `https://docs-sites.macro.com`. Sites are served under
    /// `{base}/{slug}/`.
    public_base_url: String,
}

impl<R, C, S, G> Clone for DocumentationServiceImpl<R, C, S, G>
where
    R: Clone,
    C: Clone,
    S: Clone,
    G: Clone,
{
    fn clone(&self) -> Self {
        Self {
            repo: self.repo.clone(),
            content_source: self.content_source.clone(),
            site_store: self.site_store.clone(),
            gate: self.gate.clone(),
            public_base_url: self.public_base_url.clone(),
        }
    }
}

impl<R, C, S, G> DocumentationServiceImpl<R, C, S, G>
where
    R: DocumentationRepository,
    C: PageContentSource,
    S: PublishedSiteStore,
    G: DocumentationGate,
{
    /// Creates a new documentation service.
    pub fn new(
        repo: R,
        content_source: C,
        site_store: S,
        gate: G,
        public_base_url: String,
    ) -> Self {
        Self {
            repo,
            content_source,
            site_store,
            gate,
            public_base_url: public_base_url.trim_end_matches('/').to_string(),
        }
    }

    /// Team id carried by a team receipt.
    fn receipt_team_id<T: entity_access::domain::models::RequiredPermission>(
        receipt: &EntityAccessReceipt<T>,
    ) -> Result<uuid::Uuid, DocumentationError> {
        uuid::Uuid::parse_str(&receipt.entity().entity_id).map_err(|e| {
            DocumentationError::Internal(rootcause::report!("invalid team id in receipt: {e}"))
        })
    }

    /// The authenticated user id carried by a receipt, for attribution.
    fn receipt_user_id<T: entity_access::domain::models::RequiredPermission>(
        receipt: &EntityAccessReceipt<T>,
    ) -> String {
        receipt
            .get_authenticated_user()
            .map(|id| id.to_string())
            .unwrap_or_default()
    }

    /// Rejects the call unless the team satisfies the plan gate and toggle.
    async fn ensure_available(&self, team_id: &uuid::Uuid) -> Result<(), DocumentationError> {
        let availability = self.gate.availability(team_id).await?;
        if !availability.plan_ok {
            return Err(DocumentationError::TeamPlanRequired);
        }
        if !availability.enabled {
            return Err(DocumentationError::NotEnabled);
        }
        Ok(())
    }

    /// Loads a site and verifies it belongs to the receipt's team. A site
    /// belonging to another team reports [`DocumentationError::SiteNotFound`]
    /// rather than leaking its existence.
    async fn load_team_site(
        &self,
        team_id: &uuid::Uuid,
        site_id: &uuid::Uuid,
    ) -> Result<DocumentationSite, DocumentationError> {
        let site = self
            .repo
            .get_site(site_id)
            .await?
            .ok_or(DocumentationError::SiteNotFound)?;
        if site.team_id != *team_id {
            return Err(DocumentationError::SiteNotFound);
        }
        Ok(site)
    }

    fn validate_title(title: &str) -> Result<String, DocumentationError> {
        let title = title.trim();
        if title.is_empty() || title.len() > TITLE_MAX_LEN {
            return Err(DocumentationError::BadRequest(format!(
                "title must be 1..={TITLE_MAX_LEN} characters"
            )));
        }
        Ok(title.to_string())
    }

    /// Renders and uploads the site, updating the build row. Runs in a
    /// spawned task; all failures land in the build's `error`.
    async fn run_build(self, site: DocumentationSite, nav: Vec<NavTreeNode>, build_id: uuid::Uuid) {
        if let Err(error) = self.run_build_inner(&site, nav, &build_id).await {
            tracing::error!(error = ?error, site_id = %site.id, build_id = %build_id, "documentation publish failed");
            self.repo
                .mark_build_failed(&build_id, &error.to_string())
                .await
                .inspect_err(|e| {
                    tracing::error!(error = ?e, build_id = %build_id, "failed to mark documentation build failed");
                })
                .ok();
        }
    }

    async fn run_build_inner(
        &self,
        site: &DocumentationSite,
        nav: Vec<NavTreeNode>,
        build_id: &uuid::Uuid,
    ) -> Result<(), DocumentationError> {
        self.repo.mark_build_in_progress(build_id).await?;

        let mut page_markdown = BTreeMap::new();

        // Fetch every page's markdown up front so a mid-render failure
        // never publishes a half-updated site.
        for (node_id, document_id) in
            collect_page_nodes(&nav, &mut |node| (node.id, node.document_id.clone()))
        {
            let Some(document_id) = document_id else {
                continue;
            };
            let markdown = self
                .content_source
                .get_markdown(&document_id)
                .await
                .map_err(|report| {
                    DocumentationError::Internal(
                        report.attach(format!("exporting markdown for document {document_id}")),
                    )
                })?;
            page_markdown.insert(node_id, markdown);
        }

        let input = RenderSiteInput {
            site_name: site.name.clone(),
            public_base_url: self.site_public_url_inner(site),
            nav,
            page_markdown,
        };
        let files = render_site(&input)?;
        let page_count = i32::try_from(input.page_markdown.len()).unwrap_or(i32::MAX);

        self.site_store
            .publish(&site.slug, &files)
            .await
            .map_err(DocumentationError::Internal)?;

        self.repo.mark_build_succeeded(build_id, page_count).await?;
        self.repo
            .set_site_published_at(&site.id, chrono::Utc::now())
            .await?;
        Ok(())
    }

    fn site_public_url_inner(&self, site: &DocumentationSite) -> String {
        match &site.custom_domain {
            Some(domain) => format!("https://{domain}"),
            None => format!("{}/{}/", self.public_base_url, site.slug),
        }
    }
}

/// Collects `f(node)` over every page node of the tree, depth-first.
fn collect_page_nodes<T>(nodes: &[NavTreeNode], f: &mut impl FnMut(&NavNode) -> T) -> Vec<T> {
    let mut out = Vec::new();
    fn walk<T>(nodes: &[NavTreeNode], f: &mut impl FnMut(&NavNode) -> T, out: &mut Vec<T>) {
        for node in nodes {
            if node.node.kind == NavNodeKind::Page {
                out.push(f(&node.node));
            }
            walk(&node.children, f, out);
        }
    }
    walk(nodes, f, &mut out);
    out
}

impl<R, C, S, G> DocumentationService for DocumentationServiceImpl<R, C, S, G>
where
    R: DocumentationRepository,
    C: PageContentSource,
    S: PublishedSiteStore,
    G: DocumentationGate,
{
    #[tracing::instrument(skip(self, receipt), err)]
    async fn get_availability(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
    ) -> Result<DocumentationAvailability, DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        Ok(self.gate.availability(&team_id).await?)
    }

    #[tracing::instrument(skip(self, receipt), err)]
    async fn list_sites(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
    ) -> Result<Vec<DocumentationSite>, DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        self.ensure_available(&team_id).await?;
        self.repo.list_sites_for_team(&team_id).await
    }

    #[tracing::instrument(skip(self, receipt), err)]
    async fn create_site(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        args: CreateSiteArgs,
    ) -> Result<DocumentationSite, DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        self.ensure_available(&team_id).await?;

        let name = Self::validate_title(&args.name)?;
        let slug = match args.slug.as_deref() {
            Some(raw) => SiteSlug::new(raw)?,
            None => SiteSlug::from_name(&name)
                .ok_or_else(|| DocumentationError::InvalidSlug(name.clone()))?,
        };

        let now = chrono::Utc::now();
        let site = DocumentationSite {
            id: macro_uuid_v7(),
            team_id,
            user_id: Self::receipt_user_id(&receipt),
            name,
            slug,
            custom_domain: None,
            published_at: None,
            created_at: now,
            updated_at: now,
        };
        self.repo.create_site(&site).await?;
        Ok(site)
    }

    #[tracing::instrument(skip(self, receipt), err)]
    async fn get_site(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
    ) -> Result<SiteDetail, DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        self.ensure_available(&team_id).await?;
        let site = self.load_team_site(&team_id, &site_id).await?;
        let nodes = self.repo.list_nav_nodes(&site_id).await?;
        let latest_build = self.repo.get_latest_build(&site_id).await?;
        Ok(SiteDetail {
            site,
            nav: build_nav_tree(nodes),
            latest_build,
        })
    }

    #[tracing::instrument(skip(self, receipt), err)]
    async fn update_site(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
        args: UpdateSiteArgs,
    ) -> Result<DocumentationSite, DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        self.ensure_available(&team_id).await?;
        let existing = self.load_team_site(&team_id, &site_id).await?;

        let name = args.name.as_deref().map(Self::validate_title).transpose()?;
        let slug = args.slug.as_deref().map(SiteSlug::new).transpose()?;
        if name.is_none() && slug.is_none() {
            return Ok(existing);
        }

        // A slug change moves the public URL: remove the old published
        // output so the site never serves from two locations at once.
        let old_slug = existing.slug.clone();
        let site = self
            .repo
            .update_site(&site_id, name.as_deref(), slug.as_ref())
            .await?;
        if let Some(new_slug) = slug.as_ref()
            && *new_slug != old_slug
            && existing.published_at.is_some()
        {
            self.site_store
                .remove(&old_slug)
                .await
                .map_err(DocumentationError::Internal)?;
        }
        Ok(site)
    }

    #[tracing::instrument(skip(self, receipt), err)]
    async fn delete_site(
        &self,
        receipt: EntityAccessReceipt<AdminTeamRole>,
        site_id: uuid::Uuid,
    ) -> Result<(), DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        self.ensure_available(&team_id).await?;
        let site = self.load_team_site(&team_id, &site_id).await?;
        self.repo.delete_site(&site_id).await?;
        // Take down the published output after the row is gone; a failure
        // here leaves orphaned files but never a half-deleted site.
        if site.published_at.is_some() {
            self.site_store
                .remove(&site.slug)
                .await
                .map_err(DocumentationError::Internal)?;
        }
        Ok(())
    }

    #[tracing::instrument(skip(self, receipt), err)]
    async fn set_custom_domain(
        &self,
        receipt: EntityAccessReceipt<AdminTeamRole>,
        site_id: uuid::Uuid,
        domain: Option<String>,
    ) -> Result<DocumentationSite, DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        self.ensure_available(&team_id).await?;
        self.load_team_site(&team_id, &site_id).await?;
        let domain = domain.as_deref().map(CustomDomain::new).transpose()?;
        self.repo.set_custom_domain(&site_id, domain.as_ref()).await
    }

    #[tracing::instrument(skip(self, receipt, document_receipt), err)]
    async fn create_nav_node(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
        args: CreateNavNodeArgs,
        document_receipt: Option<EntityAccessReceipt<ViewAccessLevel>>,
    ) -> Result<NavNode, DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        self.ensure_available(&team_id).await?;
        self.load_team_site(&team_id, &site_id).await?;

        let title = Self::validate_title(&args.title)?;

        // A parent must exist, belong to this site, and be a group.
        if let Some(parent_id) = args.parent_id.as_ref() {
            let nodes = self.repo.list_nav_nodes(&site_id).await?;
            let parent = nodes
                .iter()
                .find(|n| n.id == *parent_id)
                .ok_or(DocumentationError::NodeNotFound)?;
            if parent.kind != NavNodeKind::Group {
                return Err(DocumentationError::BadRequest(
                    "parent must be a group".to_string(),
                ));
            }
        }

        let (path, document_id) = match args.kind {
            NavNodeKind::Group => {
                if args.document_id.is_some() || args.path.is_some() {
                    return Err(DocumentationError::BadRequest(
                        "groups cannot carry a path or document".to_string(),
                    ));
                }
                (None, None)
            }
            NavNodeKind::Page => {
                let document_id = args.document_id.clone().ok_or_else(|| {
                    DocumentationError::BadRequest("pages require a document_id".to_string())
                })?;
                // The document receipt is the caller's proof of access to
                // the backing document — without it, any private document
                // could be published by guessing its id.
                let document_receipt =
                    document_receipt.ok_or(DocumentationError::DocumentNotUsable(
                        "no access to the backing document".to_string(),
                    ))?;
                if document_receipt.entity().entity_id != document_id {
                    return Err(DocumentationError::DocumentNotUsable(
                        "document receipt does not match document_id".to_string(),
                    ));
                }
                if !self.repo.document_usable_as_page(&document_id).await? {
                    return Err(DocumentationError::DocumentNotUsable(
                        "document is missing, deleted, or not markdown".to_string(),
                    ));
                }
                let path = match args.path.as_deref() {
                    Some(raw) => PagePath::new(raw)?,
                    None => PagePath::from_title(&title)
                        .ok_or_else(|| DocumentationError::InvalidPath(title.clone()))?,
                };
                (Some(path), Some(document_id))
            }
        };

        let node = NavNode {
            id: macro_uuid_v7(),
            site_id,
            parent_id: args.parent_id,
            kind: args.kind,
            title,
            path,
            document_id,
            position: 0, // repo assigns the end of the sibling list
        };
        self.repo.create_nav_node(&node).await
    }

    #[tracing::instrument(skip(self, receipt), err)]
    async fn update_nav_node(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
        node_id: uuid::Uuid,
        args: UpdateNavNodeArgs,
    ) -> Result<NavNode, DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        self.ensure_available(&team_id).await?;
        self.load_team_site(&team_id, &site_id).await?;

        let title = args
            .title
            .as_deref()
            .map(Self::validate_title)
            .transpose()?;
        let path = args.path.as_deref().map(PagePath::new).transpose()?;

        if path.is_some() {
            let nodes = self.repo.list_nav_nodes(&site_id).await?;
            let node = nodes
                .iter()
                .find(|n| n.id == node_id)
                .ok_or(DocumentationError::NodeNotFound)?;
            if node.kind != NavNodeKind::Page {
                return Err(DocumentationError::BadRequest(
                    "groups have no path".to_string(),
                ));
            }
        }

        self.repo
            .update_nav_node(&site_id, &node_id, title.as_deref(), path.as_ref())
            .await
    }

    #[tracing::instrument(skip(self, receipt), err)]
    async fn move_nav_node(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
        node_id: uuid::Uuid,
        new_parent_id: Option<uuid::Uuid>,
        new_position: i32,
    ) -> Result<(), DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        self.ensure_available(&team_id).await?;
        self.load_team_site(&team_id, &site_id).await?;

        if new_position < 0 {
            return Err(DocumentationError::BadRequest(
                "position must be non-negative".to_string(),
            ));
        }

        let nodes = self.repo.list_nav_nodes(&site_id).await?;
        let node = nodes
            .iter()
            .find(|n| n.id == node_id)
            .ok_or(DocumentationError::NodeNotFound)?;

        if let Some(parent_id) = new_parent_id.as_ref() {
            let parent = nodes
                .iter()
                .find(|n| n.id == *parent_id)
                .ok_or(DocumentationError::NodeNotFound)?;
            if parent.kind != NavNodeKind::Group {
                return Err(DocumentationError::BadRequest(
                    "parent must be a group".to_string(),
                ));
            }
            // Reject cycles: the new parent must not be the node itself or
            // any of its descendants.
            let mut ancestor = Some(*parent_id);
            let by_id: std::collections::HashMap<uuid::Uuid, Option<uuid::Uuid>> =
                nodes.iter().map(|n| (n.id, n.parent_id)).collect();
            while let Some(current) = ancestor {
                if current == node.id {
                    return Err(DocumentationError::BadRequest(
                        "cannot move a group into itself".to_string(),
                    ));
                }
                ancestor = by_id.get(&current).copied().flatten();
            }
        }

        self.repo
            .move_nav_node(&site_id, &node_id, new_parent_id.as_ref(), new_position)
            .await
    }

    #[tracing::instrument(skip(self, receipt), err)]
    async fn delete_nav_node(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
        node_id: uuid::Uuid,
    ) -> Result<(), DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        self.ensure_available(&team_id).await?;
        self.load_team_site(&team_id, &site_id).await?;
        self.repo.delete_nav_node(&site_id, &node_id).await
    }

    #[tracing::instrument(skip(self, receipt), err)]
    async fn publish_site(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
    ) -> Result<SiteBuild, DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        self.ensure_available(&team_id).await?;
        let site = self.load_team_site(&team_id, &site_id).await?;

        let nodes = self.repo.list_nav_nodes(&site_id).await?;
        if !nodes
            .iter()
            .any(|n| n.kind == NavNodeKind::Page && n.document_id.is_some())
        {
            return Err(DocumentationError::NoPages);
        }

        if let Some(latest) = self.repo.get_latest_build(&site_id).await?
            && latest.is_running()
            && chrono::Utc::now() - latest.created_at < STALE_BUILD_AFTER
        {
            return Err(DocumentationError::BuildInProgress);
        }

        let build = SiteBuild {
            id: macro_uuid_v7(),
            site_id,
            user_id: Self::receipt_user_id(&receipt),
            status: BuildStatus::Pending,
            error: None,
            page_count: None,
            created_at: chrono::Utc::now(),
            finished_at: None,
        };
        self.repo.create_build(&build).await?;

        let nav = build_nav_tree(nodes);
        let service = self.clone();
        let build_id = build.id;
        tokio::spawn(async move {
            service.run_build(site, nav, build_id).await;
        });

        Ok(build)
    }

    #[tracing::instrument(skip(self, receipt), err)]
    async fn get_latest_build(
        &self,
        receipt: EntityAccessReceipt<MemberTeamRole>,
        site_id: uuid::Uuid,
    ) -> Result<Option<SiteBuild>, DocumentationError> {
        let team_id = Self::receipt_team_id(&receipt)?;
        self.ensure_available(&team_id).await?;
        self.load_team_site(&team_id, &site_id).await?;
        self.repo.get_latest_build(&site_id).await
    }

    fn site_public_url(&self, site: &DocumentationSite) -> String {
        self.site_public_url_inner(site)
    }
}

/// Generates a UUIDv7 (time-ordered) id.
fn macro_uuid_v7() -> uuid::Uuid {
    macro_uuid::generate_uuid_v7()
}
