use macro_db_migrator::MACRO_DB_MIGRATIONS;
use sqlx::PgPool;
use uuid::Uuid;

use super::*;
use crate::domain::model::DocumentationSite;

const OWNER_ID: &str = "macro|owner@test.com";

async fn seed_team(pool: &PgPool, team_id: Uuid) -> sqlx::Result<()> {
    let macro_user_id = Uuid::now_v7();

    sqlx::query(
        r#"INSERT INTO macro_user (id, username, email, stripe_customer_id) VALUES ($1, $2, $3, $4)"#,
    )
    .bind(macro_user_id)
    .bind(OWNER_ID)
    .bind(OWNER_ID)
    .bind(format!("stripe_{macro_user_id}"))
    .execute(pool)
    .await?;

    sqlx::query(r#"INSERT INTO "User" (id, email, macro_user_id) VALUES ($1, $2, $3)"#)
        .bind(OWNER_ID)
        .bind(OWNER_ID)
        .bind(macro_user_id)
        .execute(pool)
        .await?;

    sqlx::query(r#"INSERT INTO team (id, name, owner_id) VALUES ($1, $2, $3)"#)
        .bind(team_id)
        .bind("test team")
        .bind(OWNER_ID)
        .execute(pool)
        .await?;

    Ok(())
}

async fn seed_document(pool: &PgPool, file_type: &str) -> sqlx::Result<String> {
    let document_id = Uuid::now_v7().to_string();
    sqlx::query(r#"INSERT INTO "Document" (id, name, owner, "fileType") VALUES ($1, $2, $3, $4)"#)
        .bind(&document_id)
        .bind("Test Doc")
        .bind(OWNER_ID)
        .bind(file_type)
        .execute(pool)
        .await?;
    Ok(document_id)
}

fn test_site(team_id: Uuid, slug: &str) -> DocumentationSite {
    let now = chrono::Utc::now();
    DocumentationSite {
        id: Uuid::now_v7(),
        team_id,
        user_id: OWNER_ID.to_string(),
        name: "Test Site".to_string(),
        slug: SiteSlug::new(slug).unwrap(),
        custom_domain: None,
        published_at: None,
        created_at: now,
        updated_at: now,
    }
}

fn test_page(site_id: Uuid, parent_id: Option<Uuid>, path: &str, document_id: &str) -> NavNode {
    NavNode {
        id: Uuid::now_v7(),
        site_id,
        parent_id,
        kind: NavNodeKind::Page,
        title: format!("Page {path}"),
        path: Some(PagePath::new(path).unwrap()),
        document_id: Some(document_id.to_string()),
        position: 0,
    }
}

fn test_group(site_id: Uuid, title: &str) -> NavNode {
    NavNode {
        id: Uuid::now_v7(),
        site_id,
        parent_id: None,
        kind: NavNodeKind::Group,
        title: title.to_string(),
        path: None,
        document_id: None,
        position: 0,
    }
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn site_crud_roundtrip(pool: PgPool) -> anyhow::Result<()> {
    let team_id = Uuid::now_v7();
    seed_team(&pool, team_id).await?;
    let repo = DocumentationRepositoryImpl::new(pool);

    let site = test_site(team_id, "test-site");
    repo.create_site(&site).await?;

    let fetched = repo.get_site(&site.id).await?.expect("site exists");
    assert_eq!(fetched.slug.as_str(), "test-site");
    assert_eq!(fetched.team_id, team_id);
    assert_eq!(fetched.user_id, OWNER_ID);
    assert!(fetched.custom_domain.is_none());

    let listed = repo.list_sites_for_team(&team_id).await?;
    assert_eq!(listed.len(), 1);

    let updated = repo
        .update_site(
            &site.id,
            Some("Renamed"),
            Some(&SiteSlug::new("renamed").unwrap()),
        )
        .await?;
    assert_eq!(updated.name, "Renamed");
    assert_eq!(updated.slug.as_str(), "renamed");

    let with_domain = repo
        .set_custom_domain(&site.id, Some(&CustomDomain::new("docs.test.com").unwrap()))
        .await?;
    assert_eq!(with_domain.custom_domain.unwrap().as_str(), "docs.test.com");

    repo.set_site_published_at(&site.id, chrono::Utc::now())
        .await?;
    assert!(
        repo.get_site(&site.id)
            .await?
            .unwrap()
            .published_at
            .is_some()
    );

    repo.delete_site(&site.id).await?;
    assert!(repo.get_site(&site.id).await?.is_none());

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn duplicate_slug_and_domain_are_conflicts(pool: PgPool) -> anyhow::Result<()> {
    let team_id = Uuid::now_v7();
    seed_team(&pool, team_id).await?;
    let repo = DocumentationRepositoryImpl::new(pool);

    let site_a = test_site(team_id, "docs");
    repo.create_site(&site_a).await?;

    let site_b = test_site(team_id, "docs");
    assert!(matches!(
        repo.create_site(&site_b).await,
        Err(DocumentationError::SlugTaken)
    ));

    let site_c = test_site(team_id, "docs-2");
    repo.create_site(&site_c).await?;
    repo.set_custom_domain(
        &site_a.id,
        Some(&CustomDomain::new("docs.test.com").unwrap()),
    )
    .await?;
    assert!(matches!(
        repo.set_custom_domain(
            &site_c.id,
            Some(&CustomDomain::new("docs.test.com").unwrap())
        )
        .await,
        Err(DocumentationError::DomainTaken)
    ));

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn nav_nodes_append_and_conflict_on_path(pool: PgPool) -> anyhow::Result<()> {
    let team_id = Uuid::now_v7();
    seed_team(&pool, team_id).await?;
    let document_id = seed_document(&pool, "md").await?;
    let repo = DocumentationRepositoryImpl::new(pool);

    let site = test_site(team_id, "docs");
    repo.create_site(&site).await?;

    let first = repo
        .create_nav_node(&test_page(site.id, None, "one", &document_id))
        .await?;
    let second = repo
        .create_nav_node(&test_page(site.id, None, "two", &document_id))
        .await?;
    assert_eq!(first.position, 0);
    assert_eq!(second.position, 1);

    // Same path in the same site conflicts.
    assert!(matches!(
        repo.create_nav_node(&test_page(site.id, None, "one", &document_id))
            .await,
        Err(DocumentationError::PathTaken)
    ));

    // A group starts its own sibling list.
    let group = repo.create_nav_node(&test_group(site.id, "Group")).await?;
    assert_eq!(group.position, 2);
    let child = repo
        .create_nav_node(&test_page(
            site.id,
            Some(group.id),
            "group/child",
            &document_id,
        ))
        .await?;
    assert_eq!(child.position, 0);

    let nodes = repo.list_nav_nodes(&site.id).await?;
    assert_eq!(nodes.len(), 4);

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn move_nav_node_renumbers_siblings(pool: PgPool) -> anyhow::Result<()> {
    let team_id = Uuid::now_v7();
    seed_team(&pool, team_id).await?;
    let document_id = seed_document(&pool, "md").await?;
    let repo = DocumentationRepositoryImpl::new(pool);

    let site = test_site(team_id, "docs");
    repo.create_site(&site).await?;

    let a = repo
        .create_nav_node(&test_page(site.id, None, "a", &document_id))
        .await?;
    let b = repo
        .create_nav_node(&test_page(site.id, None, "b", &document_id))
        .await?;
    let c = repo
        .create_nav_node(&test_page(site.id, None, "c", &document_id))
        .await?;

    // Move c to the front: order becomes c, a, b.
    repo.move_nav_node(&site.id, &c.id, None, 0).await?;
    let order: Vec<(Uuid, i32)> = {
        let mut nodes = repo.list_nav_nodes(&site.id).await?;
        nodes.sort_by_key(|n| n.position);
        nodes.iter().map(|n| (n.id, n.position)).collect()
    };
    assert_eq!(order, vec![(c.id, 0), (a.id, 1), (b.id, 2)]);

    // Move c into a group; the old siblings close the gap.
    let group = repo.create_nav_node(&test_group(site.id, "Group")).await?;
    repo.move_nav_node(&site.id, &c.id, Some(&group.id), 5)
        .await?;
    let nodes = repo.list_nav_nodes(&site.id).await?;
    let moved = nodes.iter().find(|n| n.id == c.id).unwrap();
    assert_eq!(moved.parent_id, Some(group.id));
    assert_eq!(moved.position, 0, "position is clamped to the sibling list");
    let a_pos = nodes.iter().find(|n| n.id == a.id).unwrap().position;
    let b_pos = nodes.iter().find(|n| n.id == b.id).unwrap().position;
    assert_eq!((a_pos, b_pos), (0, 1));

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn delete_nav_node_closes_gap_and_cascades(pool: PgPool) -> anyhow::Result<()> {
    let team_id = Uuid::now_v7();
    seed_team(&pool, team_id).await?;
    let document_id = seed_document(&pool, "md").await?;
    let repo = DocumentationRepositoryImpl::new(pool);

    let site = test_site(team_id, "docs");
    repo.create_site(&site).await?;

    let group = repo.create_nav_node(&test_group(site.id, "Group")).await?;
    let _child = repo
        .create_nav_node(&test_page(site.id, Some(group.id), "child", &document_id))
        .await?;
    let after = repo
        .create_nav_node(&test_page(site.id, None, "after", &document_id))
        .await?;

    // Deleting the group cascades to its child and renumbers `after`.
    repo.delete_nav_node(&site.id, &group.id).await?;
    let nodes = repo.list_nav_nodes(&site.id).await?;
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0].id, after.id);
    assert_eq!(nodes[0].position, 0);

    // Deleting a node from another site's id space is NotFound.
    assert!(matches!(
        repo.delete_nav_node(&site.id, &group.id).await,
        Err(DocumentationError::NodeNotFound)
    ));

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn document_usable_as_page_checks_type_and_deletion(pool: PgPool) -> anyhow::Result<()> {
    let team_id = Uuid::now_v7();
    seed_team(&pool, team_id).await?;
    let markdown_doc = seed_document(&pool, "md").await?;
    let pdf_doc = seed_document(&pool, "pdf").await?;
    let deleted_doc = seed_document(&pool, "md").await?;
    sqlx::query(r#"UPDATE "Document" SET "deletedAt" = now() WHERE id = $1"#)
        .bind(&deleted_doc)
        .execute(&pool)
        .await?;

    let repo = DocumentationRepositoryImpl::new(pool);
    assert!(repo.document_usable_as_page(&markdown_doc).await?);
    assert!(!repo.document_usable_as_page(&pdf_doc).await?);
    assert!(!repo.document_usable_as_page(&deleted_doc).await?);
    assert!(!repo.document_usable_as_page("missing").await?);

    Ok(())
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn build_lifecycle(pool: PgPool) -> anyhow::Result<()> {
    let team_id = Uuid::now_v7();
    seed_team(&pool, team_id).await?;
    let repo = DocumentationRepositoryImpl::new(pool);

    let site = test_site(team_id, "docs");
    repo.create_site(&site).await?;
    assert!(repo.get_latest_build(&site.id).await?.is_none());

    let build = SiteBuild {
        id: Uuid::now_v7(),
        site_id: site.id,
        user_id: OWNER_ID.to_string(),
        status: BuildStatus::Pending,
        error: None,
        page_count: None,
        created_at: chrono::Utc::now(),
        finished_at: None,
    };
    repo.create_build(&build).await?;

    repo.mark_build_in_progress(&build.id).await?;
    let latest = repo.get_latest_build(&site.id).await?.unwrap();
    assert_eq!(latest.status, BuildStatus::InProgress);
    assert!(latest.is_running());

    repo.mark_build_succeeded(&build.id, 7).await?;
    let latest = repo.get_latest_build(&site.id).await?.unwrap();
    assert_eq!(latest.status, BuildStatus::Succeeded);
    assert_eq!(latest.page_count, Some(7));
    assert!(latest.finished_at.is_some());

    let failed = SiteBuild {
        id: Uuid::now_v7(),
        created_at: chrono::Utc::now() + chrono::Duration::seconds(1),
        ..build.clone()
    };
    repo.create_build(&failed).await?;
    repo.mark_build_failed(&failed.id, "boom").await?;
    let latest = repo.get_latest_build(&site.id).await?.unwrap();
    assert_eq!(latest.id, failed.id);
    assert_eq!(latest.status, BuildStatus::Failed);
    assert_eq!(latest.error.as_deref(), Some("boom"));

    Ok(())
}
