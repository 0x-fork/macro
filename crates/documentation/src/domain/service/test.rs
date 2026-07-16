use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use entity_access::domain::models::{EntityType, RequiredPermission};
use macro_user_id::{cowlike::CowLike, user_id::MacroUserIdStr};

use super::*;
use crate::domain::ports::RenderedFile;

fn test_user() -> MacroUserIdStr<'static> {
    MacroUserIdStr::parse_from_str("macro|owner@example.com")
        .unwrap()
        .into_owned()
}

fn team_receipt<T: RequiredPermission>(team_id: uuid::Uuid) -> EntityAccessReceipt<T> {
    EntityAccessReceipt::dangerously_assert_authenticated_user(
        test_user(),
        &team_id.to_string(),
        EntityType::Team,
    )
}

fn document_receipt(document_id: &str) -> EntityAccessReceipt<ViewAccessLevel> {
    EntityAccessReceipt::dangerously_assert_authenticated_user(
        test_user(),
        document_id,
        EntityType::Document,
    )
}

/// In-memory [`DocumentationRepository`].
#[derive(Clone, Default)]
struct FakeRepo {
    sites: Arc<Mutex<HashMap<uuid::Uuid, DocumentationSite>>>,
    nodes: Arc<Mutex<HashMap<uuid::Uuid, NavNode>>>,
    builds: Arc<Mutex<HashMap<uuid::Uuid, SiteBuild>>>,
    usable_documents: Arc<Mutex<Vec<String>>>,
}

impl DocumentationRepository for FakeRepo {
    async fn create_site(&self, site: &DocumentationSite) -> Result<(), DocumentationError> {
        let mut sites = self.sites.lock().unwrap();
        if sites.values().any(|s| s.slug == site.slug) {
            return Err(DocumentationError::SlugTaken);
        }
        sites.insert(site.id, site.clone());
        Ok(())
    }

    async fn get_site(
        &self,
        site_id: &uuid::Uuid,
    ) -> Result<Option<DocumentationSite>, DocumentationError> {
        Ok(self.sites.lock().unwrap().get(site_id).cloned())
    }

    async fn list_sites_for_team(
        &self,
        team_id: &uuid::Uuid,
    ) -> Result<Vec<DocumentationSite>, DocumentationError> {
        Ok(self
            .sites
            .lock()
            .unwrap()
            .values()
            .filter(|s| s.team_id == *team_id)
            .cloned()
            .collect())
    }

    async fn update_site(
        &self,
        site_id: &uuid::Uuid,
        name: Option<&str>,
        slug: Option<&SiteSlug>,
    ) -> Result<DocumentationSite, DocumentationError> {
        let mut sites = self.sites.lock().unwrap();
        let site = sites
            .get_mut(site_id)
            .ok_or(DocumentationError::SiteNotFound)?;
        if let Some(name) = name {
            site.name = name.to_string();
        }
        if let Some(slug) = slug {
            site.slug = slug.clone();
        }
        Ok(site.clone())
    }

    async fn set_custom_domain(
        &self,
        site_id: &uuid::Uuid,
        domain: Option<&CustomDomain>,
    ) -> Result<DocumentationSite, DocumentationError> {
        let mut sites = self.sites.lock().unwrap();
        let site = sites
            .get_mut(site_id)
            .ok_or(DocumentationError::SiteNotFound)?;
        site.custom_domain = domain.cloned();
        Ok(site.clone())
    }

    async fn delete_site(&self, site_id: &uuid::Uuid) -> Result<(), DocumentationError> {
        self.sites.lock().unwrap().remove(site_id);
        Ok(())
    }

    async fn set_site_published_at(
        &self,
        site_id: &uuid::Uuid,
        published_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), DocumentationError> {
        if let Some(site) = self.sites.lock().unwrap().get_mut(site_id) {
            site.published_at = Some(published_at);
        }
        Ok(())
    }

    async fn list_nav_nodes(
        &self,
        site_id: &uuid::Uuid,
    ) -> Result<Vec<NavNode>, DocumentationError> {
        Ok(self
            .nodes
            .lock()
            .unwrap()
            .values()
            .filter(|n| n.site_id == *site_id)
            .cloned()
            .collect())
    }

    async fn create_nav_node(&self, node: &NavNode) -> Result<NavNode, DocumentationError> {
        let mut nodes = self.nodes.lock().unwrap();
        if let Some(path) = node.path.as_ref()
            && nodes
                .values()
                .any(|n| n.site_id == node.site_id && n.path.as_ref() == Some(path))
        {
            return Err(DocumentationError::PathTaken);
        }
        let position = nodes
            .values()
            .filter(|n| n.site_id == node.site_id && n.parent_id == node.parent_id)
            .count() as i32;
        let node = NavNode {
            position,
            ..node.clone()
        };
        nodes.insert(node.id, node.clone());
        Ok(node)
    }

    async fn update_nav_node(
        &self,
        site_id: &uuid::Uuid,
        node_id: &uuid::Uuid,
        title: Option<&str>,
        path: Option<&PagePath>,
    ) -> Result<NavNode, DocumentationError> {
        let mut nodes = self.nodes.lock().unwrap();
        let node = nodes
            .get_mut(node_id)
            .filter(|n| n.site_id == *site_id)
            .ok_or(DocumentationError::NodeNotFound)?;
        if let Some(title) = title {
            node.title = title.to_string();
        }
        if let Some(path) = path {
            node.path = Some(path.clone());
        }
        Ok(node.clone())
    }

    async fn move_nav_node(
        &self,
        site_id: &uuid::Uuid,
        node_id: &uuid::Uuid,
        new_parent_id: Option<&uuid::Uuid>,
        new_position: i32,
    ) -> Result<(), DocumentationError> {
        let mut nodes = self.nodes.lock().unwrap();
        let node = nodes
            .get_mut(node_id)
            .filter(|n| n.site_id == *site_id)
            .ok_or(DocumentationError::NodeNotFound)?;
        node.parent_id = new_parent_id.copied();
        node.position = new_position;
        Ok(())
    }

    async fn delete_nav_node(
        &self,
        site_id: &uuid::Uuid,
        node_id: &uuid::Uuid,
    ) -> Result<(), DocumentationError> {
        let mut nodes = self.nodes.lock().unwrap();
        nodes
            .remove(node_id)
            .filter(|n| n.site_id == *site_id)
            .ok_or(DocumentationError::NodeNotFound)?;
        Ok(())
    }

    async fn document_usable_as_page(&self, document_id: &str) -> Result<bool, DocumentationError> {
        Ok(self
            .usable_documents
            .lock()
            .unwrap()
            .contains(&document_id.to_string()))
    }

    async fn create_build(&self, build: &SiteBuild) -> Result<(), DocumentationError> {
        self.builds.lock().unwrap().insert(build.id, build.clone());
        Ok(())
    }

    async fn get_latest_build(
        &self,
        site_id: &uuid::Uuid,
    ) -> Result<Option<SiteBuild>, DocumentationError> {
        Ok(self
            .builds
            .lock()
            .unwrap()
            .values()
            .filter(|b| b.site_id == *site_id)
            .max_by_key(|b| b.created_at)
            .cloned())
    }

    async fn mark_build_in_progress(
        &self,
        build_id: &uuid::Uuid,
    ) -> Result<(), DocumentationError> {
        if let Some(build) = self.builds.lock().unwrap().get_mut(build_id) {
            build.status = BuildStatus::InProgress;
        }
        Ok(())
    }

    async fn mark_build_succeeded(
        &self,
        build_id: &uuid::Uuid,
        page_count: i32,
    ) -> Result<(), DocumentationError> {
        if let Some(build) = self.builds.lock().unwrap().get_mut(build_id) {
            build.status = BuildStatus::Succeeded;
            build.page_count = Some(page_count);
            build.finished_at = Some(chrono::Utc::now());
        }
        Ok(())
    }

    async fn mark_build_failed(
        &self,
        build_id: &uuid::Uuid,
        error: &str,
    ) -> Result<(), DocumentationError> {
        if let Some(build) = self.builds.lock().unwrap().get_mut(build_id) {
            build.status = BuildStatus::Failed;
            build.error = Some(error.to_string());
            build.finished_at = Some(chrono::Utc::now());
        }
        Ok(())
    }
}

/// [`PageContentSource`] serving canned markdown.
#[derive(Clone, Default)]
struct FakeContentSource {
    markdown: Arc<Mutex<HashMap<String, String>>>,
    fail: bool,
}

impl PageContentSource for FakeContentSource {
    async fn get_markdown(&self, document_id: &str) -> Result<String, rootcause::Report> {
        if self.fail {
            return Err(rootcause::report!("content source failure"));
        }
        self.markdown
            .lock()
            .unwrap()
            .get(document_id)
            .cloned()
            .ok_or_else(|| rootcause::report!("no markdown for {document_id}"))
    }
}

/// [`PublishedSiteStore`] recording what was published.
#[derive(Clone, Default)]
struct FakeSiteStore {
    published: Arc<Mutex<HashMap<String, Vec<RenderedFile>>>>,
    removed: Arc<Mutex<Vec<String>>>,
}

impl PublishedSiteStore for FakeSiteStore {
    async fn publish(
        &self,
        slug: &SiteSlug,
        files: &[RenderedFile],
    ) -> Result<(), rootcause::Report> {
        self.published
            .lock()
            .unwrap()
            .insert(slug.as_str().to_string(), files.to_vec());
        Ok(())
    }

    async fn remove(&self, slug: &SiteSlug) -> Result<(), rootcause::Report> {
        self.removed.lock().unwrap().push(slug.as_str().to_string());
        Ok(())
    }
}

/// [`DocumentationGate`] with a fixed answer.
#[derive(Clone)]
struct FakeGate {
    plan_ok: bool,
    enabled: bool,
}

impl DocumentationGate for FakeGate {
    async fn availability(
        &self,
        _team_id: &uuid::Uuid,
    ) -> Result<DocumentationAvailability, rootcause::Report> {
        Ok(DocumentationAvailability {
            plan_ok: self.plan_ok,
            enabled: self.enabled,
        })
    }
}

type TestService = DocumentationServiceImpl<FakeRepo, FakeContentSource, FakeSiteStore, FakeGate>;

fn build_service(gate: FakeGate) -> (TestService, FakeRepo, FakeContentSource, FakeSiteStore) {
    let repo = FakeRepo::default();
    let content = FakeContentSource::default();
    let store = FakeSiteStore::default();
    let service = DocumentationServiceImpl::new(
        repo.clone(),
        content.clone(),
        store.clone(),
        gate,
        "https://docs-sites.macro.com".to_string(),
    );
    (service, repo, content, store)
}

fn available_gate() -> FakeGate {
    FakeGate {
        plan_ok: true,
        enabled: true,
    }
}

async fn create_test_site(service: &TestService, team_id: uuid::Uuid) -> DocumentationSite {
    service
        .create_site(
            team_receipt(team_id),
            CreateSiteArgs {
                name: "Macro Docs".to_string(),
                slug: None,
            },
        )
        .await
        .unwrap()
}

/// Waits for the spawned publish task to reach a terminal build status.
async fn wait_for_build(repo: &FakeRepo, site_id: &uuid::Uuid) -> SiteBuild {
    for _ in 0..100 {
        if let Some(build) = repo.get_latest_build(site_id).await.unwrap()
            && !build.is_running()
        {
            return build;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    panic!("build never finished");
}

#[tokio::test]
async fn create_site_derives_slug_from_name() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, ..) = build_service(available_gate());

    let site = create_test_site(&service, team_id).await;
    assert_eq!(site.slug.as_str(), "macro-docs");
    assert_eq!(site.team_id, team_id);
    assert_eq!(site.user_id, "macro|owner@example.com");
    assert_eq!(
        service.site_public_url(&site),
        "https://docs-sites.macro.com/macro-docs/"
    );
}

#[tokio::test]
async fn operations_require_team_plan() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, ..) = build_service(FakeGate {
        plan_ok: false,
        enabled: true,
    });

    let error = service
        .create_site(
            team_receipt(team_id),
            CreateSiteArgs {
                name: "Docs".to_string(),
                slug: None,
            },
        )
        .await
        .unwrap_err();
    assert!(matches!(error, DocumentationError::TeamPlanRequired));
}

#[tokio::test]
async fn operations_require_team_toggle() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, ..) = build_service(FakeGate {
        plan_ok: true,
        enabled: false,
    });

    let error = service.list_sites(team_receipt(team_id)).await.unwrap_err();
    assert!(matches!(error, DocumentationError::NotEnabled));
}

#[tokio::test]
async fn availability_is_reported_even_when_gated() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, ..) = build_service(FakeGate {
        plan_ok: false,
        enabled: false,
    });

    let availability = service
        .get_availability(team_receipt(team_id))
        .await
        .unwrap();
    assert!(!availability.plan_ok);
    assert!(!availability.enabled);
}

#[tokio::test]
async fn get_site_hides_other_teams_sites() {
    let team_a = uuid::Uuid::from_u128(1);
    let team_b = uuid::Uuid::from_u128(2);
    let (service, ..) = build_service(available_gate());

    let site = create_test_site(&service, team_a).await;

    let error = service
        .get_site(team_receipt(team_b), site.id)
        .await
        .unwrap_err();
    assert!(matches!(error, DocumentationError::SiteNotFound));
}

#[tokio::test]
async fn create_page_requires_document_receipt() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, repo, ..) = build_service(available_gate());
    repo.usable_documents.lock().unwrap().push("doc-1".into());
    let site = create_test_site(&service, team_id).await;

    let args = CreateNavNodeArgs {
        kind: NavNodeKind::Page,
        title: "Getting Started".to_string(),
        parent_id: None,
        path: None,
        document_id: Some("doc-1".to_string()),
    };

    // Without a receipt: rejected.
    let error = service
        .create_nav_node(team_receipt(team_id), site.id, args.clone(), None)
        .await
        .unwrap_err();
    assert!(matches!(error, DocumentationError::DocumentNotUsable(_)));

    // Receipt for a different document: rejected.
    let error = service
        .create_nav_node(
            team_receipt(team_id),
            site.id,
            args.clone(),
            Some(document_receipt("doc-other")),
        )
        .await
        .unwrap_err();
    assert!(matches!(error, DocumentationError::DocumentNotUsable(_)));

    // Matching receipt: allowed, path derived from title.
    let node = service
        .create_nav_node(
            team_receipt(team_id),
            site.id,
            args,
            Some(document_receipt("doc-1")),
        )
        .await
        .unwrap();
    assert_eq!(node.path.unwrap().as_str(), "getting-started");
}

#[tokio::test]
async fn create_page_rejects_unusable_document() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, ..) = build_service(available_gate());
    let site = create_test_site(&service, team_id).await;

    // doc-1 is not registered as usable (deleted / not markdown).
    let error = service
        .create_nav_node(
            team_receipt(team_id),
            site.id,
            CreateNavNodeArgs {
                kind: NavNodeKind::Page,
                title: "Page".to_string(),
                parent_id: None,
                path: None,
                document_id: Some("doc-1".to_string()),
            },
            Some(document_receipt("doc-1")),
        )
        .await
        .unwrap_err();
    assert!(matches!(error, DocumentationError::DocumentNotUsable(_)));
}

#[tokio::test]
async fn create_group_rejects_page_fields() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, ..) = build_service(available_gate());
    let site = create_test_site(&service, team_id).await;

    let error = service
        .create_nav_node(
            team_receipt(team_id),
            site.id,
            CreateNavNodeArgs {
                kind: NavNodeKind::Group,
                title: "Group".to_string(),
                parent_id: None,
                path: Some("path".to_string()),
                document_id: None,
            },
            None,
        )
        .await
        .unwrap_err();
    assert!(matches!(error, DocumentationError::BadRequest(_)));
}

#[tokio::test]
async fn move_nav_node_rejects_cycles() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, ..) = build_service(available_gate());
    let site = create_test_site(&service, team_id).await;

    let group = service
        .create_nav_node(
            team_receipt(team_id),
            site.id,
            CreateNavNodeArgs {
                kind: NavNodeKind::Group,
                title: "Group".to_string(),
                parent_id: None,
                path: None,
                document_id: None,
            },
            None,
        )
        .await
        .unwrap();

    let error = service
        .move_nav_node(team_receipt(team_id), site.id, group.id, Some(group.id), 0)
        .await
        .unwrap_err();
    assert!(matches!(error, DocumentationError::BadRequest(_)));
}

#[tokio::test]
async fn publish_requires_pages() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, ..) = build_service(available_gate());
    let site = create_test_site(&service, team_id).await;

    let error = service
        .publish_site(team_receipt(team_id), site.id)
        .await
        .unwrap_err();
    assert!(matches!(error, DocumentationError::NoPages));
}

#[tokio::test]
async fn publish_renders_and_uploads_site() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, repo, content, store) = build_service(available_gate());
    repo.usable_documents.lock().unwrap().push("doc-1".into());
    content
        .markdown
        .lock()
        .unwrap()
        .insert("doc-1".to_string(), "# Hello\n\nWorld.".to_string());
    let site = create_test_site(&service, team_id).await;
    service
        .create_nav_node(
            team_receipt(team_id),
            site.id,
            CreateNavNodeArgs {
                kind: NavNodeKind::Page,
                title: "Hello".to_string(),
                parent_id: None,
                path: Some("index".to_string()),
                document_id: Some("doc-1".to_string()),
            },
            Some(document_receipt("doc-1")),
        )
        .await
        .unwrap();

    let build = service
        .publish_site(team_receipt(team_id), site.id)
        .await
        .unwrap();
    assert_eq!(build.status, BuildStatus::Pending);

    let finished = wait_for_build(&repo, &site.id).await;
    assert_eq!(finished.status, BuildStatus::Succeeded);
    assert_eq!(finished.page_count, Some(1));

    let published = store.published.lock().unwrap();
    let files = published.get("macro-docs").expect("site uploaded");
    assert!(files.iter().any(|f| f.path == "index.html"));

    let refreshed = repo.get_site(&site.id).await.unwrap().unwrap();
    assert!(refreshed.published_at.is_some());
}

#[tokio::test]
async fn publish_failure_marks_build_failed() {
    let team_id = uuid::Uuid::from_u128(1);
    let (_service, repo, content, _store) = build_service(available_gate());
    repo.usable_documents.lock().unwrap().push("doc-1".into());
    let content = FakeContentSource {
        markdown: content.markdown.clone(),
        fail: true,
    };
    let service = DocumentationServiceImpl::new(
        repo.clone(),
        content,
        FakeSiteStore::default(),
        available_gate(),
        "https://docs-sites.macro.com".to_string(),
    );
    let site = create_test_site(&service, team_id).await;
    service
        .create_nav_node(
            team_receipt(team_id),
            site.id,
            CreateNavNodeArgs {
                kind: NavNodeKind::Page,
                title: "Hello".to_string(),
                parent_id: None,
                path: None,
                document_id: Some("doc-1".to_string()),
            },
            Some(document_receipt("doc-1")),
        )
        .await
        .unwrap();

    service
        .publish_site(team_receipt(team_id), site.id)
        .await
        .unwrap();

    let finished = wait_for_build(&repo, &site.id).await;
    assert_eq!(finished.status, BuildStatus::Failed);
    assert!(finished.error.unwrap().contains("content source failure"));
}

#[tokio::test]
async fn publish_rejects_concurrent_builds() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, repo, content, _store) = build_service(available_gate());
    repo.usable_documents.lock().unwrap().push("doc-1".into());
    content
        .markdown
        .lock()
        .unwrap()
        .insert("doc-1".to_string(), "hi".to_string());
    let site = create_test_site(&service, team_id).await;
    service
        .create_nav_node(
            team_receipt(team_id),
            site.id,
            CreateNavNodeArgs {
                kind: NavNodeKind::Page,
                title: "Hello".to_string(),
                parent_id: None,
                path: None,
                document_id: Some("doc-1".to_string()),
            },
            Some(document_receipt("doc-1")),
        )
        .await
        .unwrap();

    // Simulate a running build.
    repo.create_build(&SiteBuild {
        id: uuid::Uuid::from_u128(77),
        site_id: site.id,
        user_id: "macro|owner@example.com".to_string(),
        status: BuildStatus::InProgress,
        error: None,
        page_count: None,
        created_at: chrono::Utc::now(),
        finished_at: None,
    })
    .await
    .unwrap();

    let error = service
        .publish_site(team_receipt(team_id), site.id)
        .await
        .unwrap_err();
    assert!(matches!(error, DocumentationError::BuildInProgress));
}

#[tokio::test]
async fn delete_site_removes_published_output() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, repo, _content, store) = build_service(available_gate());
    let site = create_test_site(&service, team_id).await;
    repo.set_site_published_at(&site.id, chrono::Utc::now())
        .await
        .unwrap();

    service
        .delete_site(team_receipt(team_id), site.id)
        .await
        .unwrap();

    assert!(repo.get_site(&site.id).await.unwrap().is_none());
    assert_eq!(*store.removed.lock().unwrap(), vec!["macro-docs"]);
}

#[tokio::test]
async fn slug_change_takes_down_old_location() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, repo, _content, store) = build_service(available_gate());
    let site = create_test_site(&service, team_id).await;
    repo.set_site_published_at(&site.id, chrono::Utc::now())
        .await
        .unwrap();

    let updated = service
        .update_site(
            team_receipt(team_id),
            site.id,
            UpdateSiteArgs {
                name: None,
                slug: Some("new-docs".to_string()),
            },
        )
        .await
        .unwrap();

    assert_eq!(updated.slug.as_str(), "new-docs");
    assert_eq!(*store.removed.lock().unwrap(), vec!["macro-docs"]);
}

#[tokio::test]
async fn custom_domain_changes_public_url() {
    let team_id = uuid::Uuid::from_u128(1);
    let (service, ..) = build_service(available_gate());
    let site = create_test_site(&service, team_id).await;

    let site = service
        .set_custom_domain(
            team_receipt(team_id),
            site.id,
            Some("docs.example.com".to_string()),
        )
        .await
        .unwrap();
    assert_eq!(service.site_public_url(&site), "https://docs.example.com");

    let error = service
        .set_custom_domain(team_receipt(team_id), site.id, Some("not a domain".into()))
        .await
        .unwrap_err();
    assert!(matches!(error, DocumentationError::InvalidDomain(_)));
}
