use super::*;
use model_entity::NamespacedIdentifier;

#[sqlx::test]
async fn test_check_foreign_entity_exists_true(pool: PgPool) -> anyhow::Result<()> {
    // Create a foreign entity using the new crate
    let ns_id = NamespacedIdentifier::parse("discord::channel:123")?;
    let entity = foreign_entity_db_client::get_or_create(&pool, ns_id).await?;

    // Check it exists
    let exists = check_foreign_entity_exists(&pool, &entity.id.to_string()).await?;
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
