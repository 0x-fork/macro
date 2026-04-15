/// Checks if a mobile welcome email has already been sent to the given email address.
#[tracing::instrument(skip(db))]
pub async fn get_mobile_welcome_email(
    db: &sqlx::Pool<sqlx::Postgres>,
    email: &str,
) -> anyhow::Result<bool> {
    let email = email.to_lowercase();

    let exists = sqlx::query!(
        r#"
            SELECT email
            FROM mobile_welcome_email
            WHERE email = $1
        "#,
        &email
    )
    .fetch_optional(db)
    .await?;

    Ok(exists.is_some())
}

/// Inserts a record indicating a mobile welcome email was sent.
#[tracing::instrument(skip(db))]
pub async fn insert_mobile_welcome_email(
    db: &sqlx::Pool<sqlx::Postgres>,
    email: &str,
) -> anyhow::Result<()> {
    let email = email.to_lowercase();

    sqlx::query!(
        r#"
            INSERT INTO mobile_welcome_email (email)
            VALUES ($1)
            ON CONFLICT (email) DO NOTHING
        "#,
        &email
    )
    .execute(db)
    .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{Pool, Postgres};

    #[sqlx::test(migrations = "migrations")]
    async fn test_insert_and_get_mobile_welcome_email(pool: Pool<Postgres>) -> anyhow::Result<()> {
        let email = "Test@Example.com";

        // Should not exist initially
        assert!(!get_mobile_welcome_email(&pool, email).await?);

        // Insert
        insert_mobile_welcome_email(&pool, email).await?;

        // Should exist now (case-insensitive)
        assert!(get_mobile_welcome_email(&pool, email).await?);
        assert!(get_mobile_welcome_email(&pool, "test@example.com").await?);

        // Duplicate insert should not error
        insert_mobile_welcome_email(&pool, email).await?;

        Ok(())
    }
}
