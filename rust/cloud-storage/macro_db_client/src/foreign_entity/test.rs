use super::*;
use model_entity::NamespacedIdentifier;

#[sqlx::test]
async fn test_get_or_create_creates_new_entity(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let ns_id = NamespacedIdentifier::parse("discord::channel:842650710688399402")?;

    let foreign_entity = get_or_create(&pool, ns_id.clone()).await?;

    assert_eq!(
        foreign_entity.namespaced_identifier,
        "discord::channel:842650710688399402"
    );
    assert_eq!(foreign_entity.path, vec!["discord", "channel"]);
    assert_eq!(foreign_entity.identifier, "842650710688399402");

    Ok(())
}

#[sqlx::test]
async fn test_get_or_create_is_idempotent(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let ns_id = NamespacedIdentifier::parse("discord::channel:842650710688399402")?;

    // Create first time
    let first = get_or_create(&pool, ns_id.clone()).await?;

    // Create second time - should return same entity
    let second = get_or_create(&pool, ns_id.clone()).await?;

    assert_eq!(first.id, second.id);
    assert_eq!(first.created_at, second.created_at);

    Ok(())
}

#[sqlx::test]
async fn test_get_by_id(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let ns_id = NamespacedIdentifier::parse("github::user:roobscoob")?;
    let created = get_or_create(&pool, ns_id).await?;

    let retrieved = get_by_id(&pool, created.id).await?;

    assert!(retrieved.is_some());
    let retrieved = retrieved.unwrap();
    assert_eq!(retrieved.id, created.id);
    assert_eq!(retrieved.namespaced_identifier, "github::user:roobscoob");

    Ok(())
}

#[sqlx::test]
async fn test_get_by_id_not_found(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let random_id = Uuid::new_v4();
    let result = get_by_id(&pool, random_id).await?;

    assert!(result.is_none());

    Ok(())
}

#[sqlx::test]
async fn test_get_by_namespaced_identifier(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let ns_id = NamespacedIdentifier::parse("github::repo::branch:macro-inc/macro#main")?;
    let created = get_or_create(&pool, ns_id.clone()).await?;

    let retrieved = get_by_namespaced_identifier(&pool, &ns_id).await?;

    assert!(retrieved.is_some());
    let retrieved = retrieved.unwrap();
    assert_eq!(retrieved.id, created.id);
    assert_eq!(
        retrieved.namespaced_identifier,
        "github::repo::branch:macro-inc/macro#main"
    );

    Ok(())
}

#[sqlx::test]
async fn test_get_by_namespaced_identifier_not_found(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let ns_id = NamespacedIdentifier::parse("discord::channel:nonexistent")?;
    let result = get_by_namespaced_identifier(&pool, &ns_id).await?;

    assert!(result.is_none());

    Ok(())
}

#[sqlx::test]
async fn test_list_by_path_prefix(pool: Pool<Postgres>) -> anyhow::Result<()> {
    // Create several entities
    get_or_create(
        &pool,
        NamespacedIdentifier::parse("discord::channel:123")?,
    )
    .await?;
    get_or_create(
        &pool,
        NamespacedIdentifier::parse("discord::channel:456")?,
    )
    .await?;
    get_or_create(&pool, NamespacedIdentifier::parse("discord::user:789")?).await?;
    get_or_create(&pool, NamespacedIdentifier::parse("github::user:abc")?).await?;

    // List all discord entities
    let discord_entities =
        list_by_path_prefix(&pool, &[String::from("discord")]).await?;
    assert_eq!(discord_entities.len(), 3);

    // List discord channel entities
    let discord_channels = list_by_path_prefix(
        &pool,
        &[String::from("discord"), String::from("channel")],
    )
    .await?;
    assert_eq!(discord_channels.len(), 2);

    // List github entities
    let github_entities = list_by_path_prefix(&pool, &[String::from("github")]).await?;
    assert_eq!(github_entities.len(), 1);

    Ok(())
}

#[sqlx::test]
async fn test_list_by_path_prefix_empty(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let results = list_by_path_prefix(&pool, &[String::from("nonexistent")]).await?;

    assert_eq!(results.len(), 0);

    Ok(())
}

#[sqlx::test]
async fn test_delete(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let ns_id = NamespacedIdentifier::parse("discord::channel:123")?;
    let created = get_or_create(&pool, ns_id.clone()).await?;

    // Delete the entity
    let deleted = delete(&pool, created.id).await?;
    assert!(deleted);

    // Verify it's gone
    let retrieved = get_by_id(&pool, created.id).await?;
    assert!(retrieved.is_none());

    Ok(())
}

#[sqlx::test]
async fn test_delete_not_found(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let random_id = Uuid::new_v4();
    let deleted = delete(&pool, random_id).await?;

    assert!(!deleted);

    Ok(())
}

#[sqlx::test]
async fn test_to_namespaced_identifier(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let ns_id = NamespacedIdentifier::parse("github::repo::branch:macro-inc/macro#main")?;
    let created = get_or_create(&pool, ns_id.clone()).await?;

    let reconstructed = created.to_namespaced_identifier()?;

    assert_eq!(reconstructed.to_string(), ns_id.to_string());
    assert_eq!(reconstructed.path(), &["github", "repo", "branch"]);
    assert_eq!(reconstructed.identifier(), "macro-inc/macro#main");

    Ok(())
}

#[sqlx::test]
async fn test_identifier_with_special_characters(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let test_cases = vec![
        "discord::channel:123#456",
        "github::repo:owner/repo",
        "service::entity:id-with-dashes",
        "service::entity:id@example.com",
        "service::entity:some:id:with:colons",
    ];

    for test_case in test_cases {
        let ns_id = NamespacedIdentifier::parse(test_case)?;
        let created = get_or_create(&pool, ns_id.clone()).await?;

        assert_eq!(created.namespaced_identifier, test_case);

        let retrieved = get_by_namespaced_identifier(&pool, &ns_id).await?;
        assert!(retrieved.is_some());
    }

    Ok(())
}
