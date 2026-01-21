use super::*;
use model_entity::NamespacedIdentifier;

#[sqlx::test]
async fn test_check_foreign_entity_exists_true(pool: PgPool) -> anyhow::Result<()> {
    // Create a foreign entity
    let ns_id = NamespacedIdentifier::parse("discord::channel:123")?;
    let ns_id_str = ns_id.to_string();
    let (path, identifier) = ns_id.into_parts();

    let entity_id = sqlx::query_scalar!(
        r#"
        INSERT INTO foreign_entities ("namespacedIdentifier", path, identifier)
        VALUES ($1, $2, $3)
        RETURNING id
        "#,
        ns_id_str,
        &path,
        identifier
    )
    .fetch_one(&pool)
    .await?;

    // Check it exists
    let exists = check_foreign_entity_exists(&pool, &entity_id.to_string()).await?;
    assert!(exists);

    Ok(())
}

#[sqlx::test]
async fn test_check_foreign_entity_exists_false(pool: PgPool) -> anyhow::Result<()> {
    let random_id = Uuid::new_v4();
    let exists = check_foreign_entity_exists(&pool, &random_id.to_string()).await?;
    assert!(!exists);

    Ok(())
}

#[sqlx::test]
async fn test_check_foreign_entity_exists_invalid_uuid(pool: PgPool) -> anyhow::Result<()> {
    let exists = check_foreign_entity_exists(&pool, "not-a-uuid").await?;
    assert!(!exists);

    Ok(())
}
