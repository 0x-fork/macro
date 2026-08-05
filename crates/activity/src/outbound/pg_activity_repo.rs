//! Postgres adapter for the `activity_events` table (MacroDB).

#[cfg(test)]
mod test;

use model_entity::EntityType;
use sqlx::PgPool;

use crate::domain::{models::ActivityFact, ports::ActivityRepo};

/// Writes activity facts to MacroDB.
#[derive(Debug, Clone)]
pub struct PgActivityRepo {
    pool: PgPool,
}

impl PgActivityRepo {
    /// Builds the adapter over a MacroDB pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl ActivityRepo for PgActivityRepo {
    type Err = sqlx::Error;

    async fn insert_facts(&self, facts: &[ActivityFact]) -> Result<(), Self::Err> {
        let mut transaction = self.pool.begin().await?;
        for fact in facts {
            let (action, action_payload) = fact.action.to_columns();
            sqlx::query!(
                r#"
                INSERT INTO activity_events
                    (id, actor_id, subject_id, action, action_payload,
                     entity_type, entity_id, occurred_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING
                "#,
                fact.id,
                fact.actor.as_ref(),
                fact.subject_id,
                action,
                action_payload,
                fact.entity_type.as_ref(),
                fact.entity_id,
                fact.occurred_at,
            )
            .execute(transaction.as_mut())
            .await?;
        }
        transaction.commit().await?;
        Ok(())
    }

    async fn purge_entity(
        &self,
        entity_type: EntityType,
        entity_id: &str,
    ) -> Result<(), Self::Err> {
        sqlx::query!(
            r#"DELETE FROM activity_events WHERE entity_type = $1 AND entity_id = $2"#,
            entity_type.as_ref(),
            entity_id,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
