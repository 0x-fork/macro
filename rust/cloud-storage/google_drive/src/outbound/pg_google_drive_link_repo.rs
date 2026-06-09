//! PostgreSQL implementation of the [`GoogleDriveRepo`] port, backed by the
//! `google_drive_links` table.

use sqlx::PgPool;

use crate::domain::models::GoogleDriveLink;
use crate::domain::ports::GoogleDriveRepo;

/// PostgreSQL-backed Google Drive link repository.
#[derive(Clone)]
pub struct PgGoogleDriveLinkRepo {
    pool: PgPool,
}

impl PgGoogleDriveLinkRepo {
    /// Create a new repository backed by the given connection pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl GoogleDriveRepo for PgGoogleDriveLinkRepo {
    type Err = sqlx::Error;

    #[tracing::instrument(skip(self), err)]
    async fn get_link_by_user_id(
        &self,
        macro_user_id: &str,
    ) -> Result<Option<GoogleDriveLink>, Self::Err> {
        sqlx::query_as!(
            GoogleDriveLink,
            r#"
            SELECT id, macro_id, fusionauth_user_id, email, created_at, updated_at
            FROM google_drive_links
            WHERE macro_id = $1
            "#,
            macro_user_id
        )
        .fetch_optional(&self.pool)
        .await
    }

    #[tracing::instrument(skip(self), err)]
    async fn upsert_link(&self, link: &GoogleDriveLink) -> Result<(), Self::Err> {
        sqlx::query!(
            r#"
            INSERT INTO google_drive_links (id, macro_id, fusionauth_user_id, email)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (macro_id)
            DO UPDATE SET
                fusionauth_user_id = EXCLUDED.fusionauth_user_id,
                email = EXCLUDED.email,
                updated_at = NOW()
            "#,
            link.id,
            link.macro_id,
            link.fusionauth_user_id,
            link.email,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn delete_link_by_user_id(&self, macro_user_id: &str) -> Result<(), Self::Err> {
        sqlx::query!(
            "DELETE FROM google_drive_links WHERE macro_id = $1",
            macro_user_id
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
