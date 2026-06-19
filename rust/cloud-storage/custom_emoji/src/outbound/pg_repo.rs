//! Postgres implementation of [`CustomEmojiRepository`] backed by MacroDB.

use macro_user_id::user_id::MacroUserIdStr;
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::model::{
    CreateCustomEmojiError, CustomEmoji, CustomEmojiError, DeleteCustomEmojiError,
};
use crate::domain::ports::CustomEmojiRepository;

/// MacroDB-backed custom emoji repository.
#[derive(Clone)]
pub struct PgCustomEmojiRepository {
    pool: PgPool,
}

impl PgCustomEmojiRepository {
    /// Creates a new repository from a connection pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl From<sqlx::Error> for CustomEmojiError {
    fn from(e: sqlx::Error) -> Self {
        Self::StorageLayerError(e.into())
    }
}

impl From<sqlx::Error> for DeleteCustomEmojiError {
    fn from(e: sqlx::Error) -> Self {
        Self::StorageLayerError(e.into())
    }
}

impl CustomEmojiRepository for PgCustomEmojiRepository {
    #[tracing::instrument(skip(self), err)]
    async fn team_ids_for_user(
        &self,
        user_id: &MacroUserIdStr<'_>,
    ) -> Result<Vec<Uuid>, CustomEmojiError> {
        let ids = sqlx::query!(
            r#"SELECT team_id FROM team_user WHERE user_id = $1"#,
            user_id.as_ref()
        )
        .map(|row| row.team_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(ids)
    }

    #[tracing::instrument(skip(self), err)]
    async fn is_team_member(
        &self,
        user_id: &MacroUserIdStr<'_>,
        team_id: &Uuid,
    ) -> Result<bool, CustomEmojiError> {
        let is_member = sqlx::query_scalar!(
            r#"SELECT EXISTS(
                 SELECT 1 FROM team_user WHERE user_id = $1 AND team_id = $2
               ) AS "exists!""#,
            user_id.as_ref(),
            team_id
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(is_member)
    }

    #[tracing::instrument(skip(self), err)]
    async fn create(
        &self,
        team_id: &Uuid,
        slug: &str,
        sfs_file_id: &str,
        created_by: &MacroUserIdStr<'_>,
    ) -> Result<CustomEmoji, CreateCustomEmojiError> {
        let id = macro_uuid::generate_uuid_v7();
        let row = sqlx::query!(
            r#"
            INSERT INTO team_custom_emoji (id, team_id, slug, sfs_file_id, created_by)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, team_id, slug, sfs_file_id, created_by, created_at
            "#,
            id,
            team_id,
            slug,
            sfs_file_id,
            created_by.as_ref(),
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                CreateCustomEmojiError::SlugAlreadyExists
            }
            other => CreateCustomEmojiError::StorageLayerError(other.into()),
        })?;

        Ok(CustomEmoji {
            id: row.id,
            team_id: row.team_id,
            slug: row.slug,
            sfs_file_id: row.sfs_file_id,
            created_by: row.created_by,
            created_at: row.created_at,
        })
    }

    #[tracing::instrument(skip(self), err)]
    async fn list_for_teams(
        &self,
        team_ids: &[Uuid],
    ) -> Result<Vec<CustomEmoji>, CustomEmojiError> {
        let rows = sqlx::query!(
            r#"
            SELECT id, team_id, slug, sfs_file_id, created_by, created_at
            FROM team_custom_emoji
            WHERE team_id = ANY($1) AND deleted_at IS NULL
            ORDER BY slug
            "#,
            team_ids
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| CustomEmoji {
                id: row.id,
                team_id: row.team_id,
                slug: row.slug,
                sfs_file_id: row.sfs_file_id,
                created_by: row.created_by,
                created_at: row.created_at,
            })
            .collect())
    }

    #[tracing::instrument(skip(self), err)]
    async fn resolve_by_ids(&self, ids: &[Uuid]) -> Result<Vec<CustomEmoji>, CustomEmojiError> {
        // Includes soft-deleted rows so already-sent messages still render.
        let rows = sqlx::query!(
            r#"
            SELECT id, team_id, slug, sfs_file_id, created_by, created_at
            FROM team_custom_emoji
            WHERE id = ANY($1)
            "#,
            ids
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| CustomEmoji {
                id: row.id,
                team_id: row.team_id,
                slug: row.slug,
                sfs_file_id: row.sfs_file_id,
                created_by: row.created_by,
                created_at: row.created_at,
            })
            .collect())
    }

    #[tracing::instrument(skip(self), err)]
    async fn soft_delete(
        &self,
        id: &Uuid,
        user_id: &MacroUserIdStr<'_>,
    ) -> Result<bool, DeleteCustomEmojiError> {
        let result = sqlx::query!(
            r#"
            UPDATE team_custom_emoji
            SET deleted_at = now()
            WHERE id = $1
              AND deleted_at IS NULL
              AND team_id IN (SELECT team_id FROM team_user WHERE user_id = $2)
            "#,
            id,
            user_id.as_ref()
        )
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
}
