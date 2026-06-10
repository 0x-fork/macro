#[cfg(test)]
mod test;

use crate::domain::{
    Memory, Result, TeamMemoryRepo,
    ports::{MemoryRecord, TeamOverview},
};
use macro_user_id::user_id::MacroUserIdStr;
use macro_uuid::Uuid;
use sqlx::PgPool;

/// Postgres-backed [`TeamMemoryRepo`] over the shared `memory` table.
pub struct PgTeamMemoryRepo {
    inner: PgPool,
}

impl PgTeamMemoryRepo {
    /// Create a new repository backed by the given pool.
    pub fn new(inner: PgPool) -> Self {
        PgTeamMemoryRepo { inner }
    }
}

impl TeamMemoryRepo for PgTeamMemoryRepo {
    async fn save_team_memory(&self, memory: &Memory, team_id: Uuid) -> Result<Uuid> {
        let id = macro_uuid::generate_uuid_v7();
        let row = sqlx::query!(
            r#"
            INSERT INTO memory (id, team_id, memory)
            VALUES ($1, $2, $3)
            ON CONFLICT (team_id) WHERE team_id IS NOT NULL DO UPDATE
            SET memory = EXCLUDED.memory,
                updated_at = NOW()
            RETURNING id
            "#,
            id,
            team_id,
            memory,
        )
        .fetch_one(&self.inner)
        .await?;

        Ok(row.id)
    }

    async fn get_latest_team_memory(&self, team_id: Uuid) -> Result<Option<MemoryRecord>> {
        let row = sqlx::query!(
            r#"
            SELECT memory, updated_at as "updated_at!"
            FROM memory
            WHERE team_id = $1
            ORDER BY updated_at DESC
            LIMIT 1
            "#,
            team_id,
        )
        .fetch_optional(&self.inner)
        .await?;

        Ok(row.map(|r| MemoryRecord {
            memory: r.memory,
            updated_at: r.updated_at,
        }))
    }

    async fn get_team_memory_by_id(&self, team_id: Uuid, id: Uuid) -> Result<Memory> {
        let row = sqlx::query!(
            r#"
            SELECT memory
            FROM memory
            WHERE id = $1 AND team_id = $2
            "#,
            id,
            team_id,
        )
        .fetch_optional(&self.inner)
        .await?
        .ok_or(crate::domain::MemoryError::NoGeneration)?;

        Ok(row.memory)
    }

    async fn get_user_team_id(&self, user: MacroUserIdStr<'_>) -> Result<Option<Uuid>> {
        // Users are expected to belong to at most one team. Mirror
        // entity_access::get_user_team: if `team_user` defensively returns
        // multiple rows, the team where the user holds the strongest role
        // wins (Postgres orders the enum `member < admin < owner`).
        let row = sqlx::query_scalar!(
            r#"
            SELECT team_id
            FROM team_user
            WHERE user_id = $1
            ORDER BY team_role DESC
            LIMIT 1
            "#,
            user.as_ref(),
        )
        .fetch_optional(&self.inner)
        .await?;

        Ok(row)
    }

    async fn get_team_overview(&self, team_id: Uuid) -> Result<Option<TeamOverview>> {
        let row = sqlx::query!(
            r#"
            SELECT t.name,
                   ARRAY_REMOVE(ARRAY_AGG(tu.user_id), NULL) as "member_ids!"
            FROM team t
            LEFT JOIN team_user tu ON tu.team_id = t.id
            WHERE t.id = $1
            GROUP BY t.id
            "#,
            team_id,
        )
        .fetch_optional(&self.inner)
        .await?;

        Ok(row.map(|r| TeamOverview {
            name: r.name,
            member_ids: r.member_ids,
        }))
    }
}
