use crate::domain::models::{MacroUserIdStr, McpServerRecord};
use crate::domain::ports::McpServerStore;
use macro_user_id::cowlike::CowLike;
use sqlx::PgPool;

/// Postgres-backed [`McpServerStore`] over the `mcp_servers` table.
///
/// Rows hold no secrets: Pipedream owns the OAuth grants, we persist only
/// the app, its display name, and the Pipedream account ID.
#[derive(Clone)]
pub struct PgServerRepo {
    pool: PgPool,
}

impl PgServerRepo {
    /// Create a repository over `pool`.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl McpServerStore for PgServerRepo {
    type Err = anyhow::Error;

    #[tracing::instrument(skip(self), err)]
    async fn save(&self, record: &McpServerRecord) -> Result<(), Self::Err> {
        sqlx::query!(
            r#"
            INSERT INTO mcp_servers (user_id, app_slug, server_name, account_id, enabled)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, app_slug) DO UPDATE SET
                server_name = EXCLUDED.server_name,
                account_id = EXCLUDED.account_id,
                enabled = EXCLUDED.enabled,
                updated_at = NOW()
            "#,
            record.user_id.as_ref(),
            record.app_slug,
            record.server_name,
            record.account_id,
            record.enabled,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn load(
        &self,
        user_id: &MacroUserIdStr<'static>,
        app_slug: &str,
    ) -> Result<Option<McpServerRecord>, Self::Err> {
        let row = sqlx::query!(
            r#"
            SELECT user_id, app_slug, server_name, account_id, enabled
            FROM mcp_servers
            WHERE user_id = $1 AND app_slug = $2
            "#,
            user_id.as_ref(),
            app_slug,
        )
        .fetch_optional(&self.pool)
        .await?;

        row.map(|row| {
            to_record(
                row.user_id,
                row.app_slug,
                row.server_name,
                row.account_id,
                row.enabled,
            )
        })
        .transpose()
    }

    #[tracing::instrument(skip(self), err)]
    async fn delete(
        &self,
        user_id: &MacroUserIdStr<'static>,
        app_slug: &str,
    ) -> Result<(), Self::Err> {
        sqlx::query!(
            "DELETE FROM mcp_servers WHERE user_id = $1 AND app_slug = $2",
            user_id.as_ref(),
            app_slug,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn list(
        &self,
        user_id: &MacroUserIdStr<'static>,
    ) -> Result<Vec<McpServerRecord>, Self::Err> {
        let rows = sqlx::query!(
            r#"
            SELECT user_id, app_slug, server_name, account_id, enabled
            FROM mcp_servers
            WHERE user_id = $1
            ORDER BY server_name
            "#,
            user_id.as_ref(),
        )
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                to_record(
                    row.user_id,
                    row.app_slug,
                    row.server_name,
                    row.account_id,
                    row.enabled,
                )
            })
            .collect()
    }
}

fn to_record(
    user_id: String,
    app_slug: String,
    server_name: String,
    account_id: String,
    enabled: bool,
) -> anyhow::Result<McpServerRecord> {
    let user_id = MacroUserIdStr::parse_from_str(&user_id)?.into_owned();
    Ok(McpServerRecord {
        user_id,
        app_slug,
        server_name,
        account_id,
        enabled,
    })
}
