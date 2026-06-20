//! Postgres-backed [`SandboxRegistry`] over the `chat_sandboxes` table.
//!
//! Uses runtime (non-macro) sqlx queries so the crate builds without a live
//! database or a prepared `.sqlx` cache. Convert to the compile-time-checked
//! `query!`/`query_as!` macros once `just prepare_db` can be run.

use async_trait::async_trait;
use sqlx::PgPool;

use crate::domain::error::{CodingError, Result};
use crate::domain::models::{SandboxRecord, SandboxStatus};
use crate::domain::ports::SandboxRegistry;

/// A [`SandboxRegistry`] backed by Postgres.
#[derive(Clone)]
pub struct PgSandboxRegistry {
    pool: PgPool,
}

#[derive(sqlx::FromRow)]
struct SandboxRow {
    chat_id: String,
    user_id: String,
    repo: String,
    backend: String,
    sandbox_id: Option<String>,
    status: String,
    work_branch: Option<String>,
    snapshot_id: Option<String>,
}

impl From<SandboxRow> for SandboxRecord {
    fn from(r: SandboxRow) -> Self {
        SandboxRecord {
            chat_id: r.chat_id,
            user_id: r.user_id,
            repo: r.repo,
            backend: r.backend,
            sandbox_id: r.sandbox_id,
            status: status_from_str(&r.status),
            work_branch: r.work_branch,
            snapshot_id: r.snapshot_id,
        }
    }
}

impl PgSandboxRegistry {
    /// Build the registry on an existing pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl SandboxRegistry for PgSandboxRegistry {
    async fn get(&self, chat_id: &str) -> Result<Option<SandboxRecord>> {
        let row = sqlx::query_as::<_, SandboxRow>(
            "SELECT chat_id, user_id, repo, backend, sandbox_id, status, work_branch, snapshot_id \
             FROM chat_sandboxes WHERE chat_id = $1",
        )
        .bind(chat_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(CodingError::registry)?;
        Ok(row.map(SandboxRecord::from))
    }

    async fn upsert(&self, record: &SandboxRecord) -> Result<()> {
        sqlx::query(
            "INSERT INTO chat_sandboxes \
                (chat_id, user_id, repo, backend, sandbox_id, status, work_branch, snapshot_id, updated_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) \
             ON CONFLICT (chat_id) DO UPDATE SET \
                user_id = EXCLUDED.user_id, \
                repo = EXCLUDED.repo, \
                backend = EXCLUDED.backend, \
                sandbox_id = EXCLUDED.sandbox_id, \
                status = EXCLUDED.status, \
                work_branch = EXCLUDED.work_branch, \
                snapshot_id = EXCLUDED.snapshot_id, \
                updated_at = now()",
        )
        .bind(&record.chat_id)
        .bind(&record.user_id)
        .bind(&record.repo)
        .bind(&record.backend)
        .bind(&record.sandbox_id)
        .bind(status_to_str(record.status))
        .bind(&record.work_branch)
        .bind(&record.snapshot_id)
        .execute(&self.pool)
        .await
        .map_err(CodingError::registry)?;
        Ok(())
    }

    async fn set_status(&self, chat_id: &str, status: SandboxStatus) -> Result<()> {
        sqlx::query("UPDATE chat_sandboxes SET status = $2, updated_at = now() WHERE chat_id = $1")
            .bind(chat_id)
            .bind(status_to_str(status))
            .execute(&self.pool)
            .await
            .map_err(CodingError::registry)?;
        Ok(())
    }

    async fn set_sandbox(&self, chat_id: &str, sandbox_id: &str) -> Result<()> {
        sqlx::query(
            "UPDATE chat_sandboxes SET sandbox_id = $2, status = 'ready', updated_at = now() \
             WHERE chat_id = $1",
        )
        .bind(chat_id)
        .bind(sandbox_id)
        .execute(&self.pool)
        .await
        .map_err(CodingError::registry)?;
        Ok(())
    }

    async fn set_snapshot(&self, chat_id: &str, snapshot_id: &str) -> Result<()> {
        sqlx::query("UPDATE chat_sandboxes SET snapshot_id = $2, updated_at = now() WHERE chat_id = $1")
            .bind(chat_id)
            .bind(snapshot_id)
            .execute(&self.pool)
            .await
            .map_err(CodingError::registry)?;
        Ok(())
    }

    async fn delete(&self, chat_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM chat_sandboxes WHERE chat_id = $1")
            .bind(chat_id)
            .execute(&self.pool)
            .await
            .map_err(CodingError::registry)?;
        Ok(())
    }
}

fn status_to_str(status: SandboxStatus) -> &'static str {
    match status {
        SandboxStatus::None => "none",
        SandboxStatus::Provisioning => "provisioning",
        SandboxStatus::Ready => "ready",
        SandboxStatus::Sleeping => "sleeping",
        SandboxStatus::Stopped => "stopped",
        SandboxStatus::Error => "error",
    }
}

fn status_from_str(s: &str) -> SandboxStatus {
    match s {
        "provisioning" => SandboxStatus::Provisioning,
        "ready" => SandboxStatus::Ready,
        "sleeping" => SandboxStatus::Sleeping,
        "stopped" => SandboxStatus::Stopped,
        "error" => SandboxStatus::Error,
        _ => SandboxStatus::None,
    }
}
