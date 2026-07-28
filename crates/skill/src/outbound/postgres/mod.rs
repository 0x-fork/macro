//! PostgreSQL implementation of the [`SkillRepo`] port.

use macro_user_id::user_id::MacroUserIdStr;
use sqlx::PgPool;

use crate::domain::models::{Result, Skill};
use crate::domain::ports::SkillRepo;

/// PostgreSQL-backed skill repository.
#[derive(Clone)]
pub struct PgSkillRepo {
    pool: PgPool,
}

impl PgSkillRepo {
    /// Create a new repository backed by the given connection pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl SkillRepo for PgSkillRepo {
    #[tracing::instrument(err, skip(self))]
    async fn list_skills(&self, user_id: &MacroUserIdStr<'_>) -> Result<Vec<Skill>> {
        let rows = sqlx::query!(
            r#"
            SELECT d.id as "document_id!", d.name as "name!"
            FROM "Document" d
            JOIN document_sub_type dt ON dt.document_id = d.id AND dt.sub_type = 'skill'
            WHERE d.owner = $1 AND d."deletedAt" IS NULL
            ORDER BY d."updatedAt" DESC
            "#,
            user_id.as_ref(),
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| rootcause::report!("failed to list skills: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| Skill {
                document_id: r.document_id,
                name: r.name,
            })
            .collect())
    }

    #[tracing::instrument(err, skip(self))]
    async fn search_skills(&self, user_id: &MacroUserIdStr<'_>, query: &str) -> Result<Vec<Skill>> {
        let pattern = format!("%{query}%");
        let rows = sqlx::query!(
            r#"
            SELECT d.id as "document_id!", d.name as "name!"
            FROM "Document" d
            JOIN document_sub_type dt ON dt.document_id = d.id AND dt.sub_type = 'skill'
            WHERE d.owner = $1 AND d."deletedAt" IS NULL AND d.name ILIKE $2
            ORDER BY d."updatedAt" DESC
            LIMIT 20
            "#,
            user_id.as_ref(),
            pattern,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| rootcause::report!("failed to search skills: {e}"))?;

        Ok(rows
            .into_iter()
            .map(|r| Skill {
                document_id: r.document_id,
                name: r.name,
            })
            .collect())
    }
}
