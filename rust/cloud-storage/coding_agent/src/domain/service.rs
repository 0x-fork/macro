//! Orchestration service: the single entry point the rest of macro uses.
//!
//! It owns the policy for *when* a sandbox is provisioned (pre-warm on repo
//! select, warm on chat activity, provision-on-demand at delegation) and wires
//! the [`SandboxRegistry`], [`GitCredentialProvider`] and [`CodingBackend`]
//! together. Everything above it depends only on the [`CodingSessionService`]
//! trait, so the concrete backend stays swappable.

use std::sync::Arc;

use async_trait::async_trait;

use super::error::{CodingError, Result};
use super::models::{
    CodingEvent, CodingOutcome, CodingTask, PermissionPolicy, RepoRef, SandboxConnection,
    SandboxId, SandboxOptions, SandboxRecord, SandboxStatus, StopReason,
};
use super::ports::{
    CodingBackend, CodingEventSink, GitCredentialProvider, RepositoryLister, SandboxRegistry,
};

/// The application-facing service for delegating coding work to a sandbox.
#[async_trait]
pub trait CodingSessionService: Send + Sync {
    /// Associate a repository with a chat and begin pre-warming a sandbox in
    /// the background. Returns the persisted record immediately.
    async fn select_repository(
        &self,
        chat_id: &str,
        user_id: &str,
        repo: RepoRef,
    ) -> Result<SandboxRecord>;

    /// Clear the repository association for a chat and tear down its sandbox.
    async fn clear_repository(&self, chat_id: &str) -> Result<()>;

    /// The current record for a chat, if any.
    async fn get_record(&self, chat_id: &str) -> Result<Option<SandboxRecord>>;

    /// Signal that the chat saw new activity: warm the sandbox back up if it
    /// exists, or start provisioning if a repo is selected but no sandbox is
    /// up yet. Cheap and idempotent; safe to fire-and-forget.
    async fn warm_on_activity(&self, chat_id: &str, user_id: &str) -> Result<()>;

    /// Whether a chat is ready to delegate coding work (a repo is selected).
    async fn can_delegate(&self, chat_id: &str) -> Result<bool>;

    /// List the repositories `user_id` can select for a chat.
    async fn list_repositories(&self, user_id: &str) -> Result<Vec<RepoRef>>;

    /// Delegate a coding task to the chat's sandbox, streaming progress to
    /// `sink`, and return the terminal outcome. Provisions the sandbox on the
    /// fly if pre-warming has not finished.
    async fn delegate(
        &self,
        chat_id: &str,
        user_id: &str,
        prompt: &str,
        sink: CodingEventSink,
    ) -> Result<CodingOutcome>;
}

/// Default implementation of [`CodingSessionService`].
#[derive(Clone)]
pub struct CodingSessionServiceImpl {
    backend: CodingBackend,
    registry: Arc<dyn SandboxRegistry>,
    credentials: Arc<dyn GitCredentialProvider>,
    repos: Arc<dyn RepositoryLister>,
    options: SandboxOptions,
    policy: PermissionPolicy,
}

impl CodingSessionServiceImpl {
    /// Construct the service from its parts.
    pub fn new(
        backend: CodingBackend,
        registry: Arc<dyn SandboxRegistry>,
        credentials: Arc<dyn GitCredentialProvider>,
        repos: Arc<dyn RepositoryLister>,
    ) -> Self {
        Self {
            backend,
            registry,
            credentials,
            repos,
            options: SandboxOptions::default(),
            policy: PermissionPolicy::default(),
        }
    }

    /// Override the default sandbox options (network policy, base snapshot).
    pub fn with_options(mut self, options: SandboxOptions) -> Self {
        self.options = options;
        self
    }

    /// Override the default permission policy.
    pub fn with_policy(mut self, policy: PermissionPolicy) -> Self {
        self.policy = policy;
        self
    }

    /// Provision (or resume) a sandbox for `record` and return a live
    /// connection, updating the registry as it goes.
    #[tracing::instrument(skip(self, record), fields(chat_id = %record.chat_id), err)]
    async fn ensure_connection(
        &self,
        record: &SandboxRecord,
        user_id: &str,
    ) -> Result<SandboxConnection> {
        let repo = record
            .repo_ref()
            .ok_or_else(|| CodingError::registry(format!("invalid repo {}", record.repo)))?;

        if let Some(sandbox_id) = &record.sandbox_id {
            let id = SandboxId(sandbox_id.clone());
            match self.backend.provider.ensure_warm(&id).await {
                Ok(connection) => {
                    self.registry
                        .set_status(&record.chat_id, SandboxStatus::Ready)
                        .await?;
                    return Ok(connection);
                }
                Err(e) => {
                    // The recorded sandbox is gone; fall through to re-provision.
                    tracing::warn!(error = ?e, sandbox_id = %sandbox_id, "recorded sandbox unavailable, re-provisioning");
                }
            }
        }

        let creds = self.credentials.credentials_for(user_id, &repo).await?;
        self.registry
            .set_status(&record.chat_id, SandboxStatus::Provisioning)
            .await?;
        let provisioned = self
            .backend
            .provider
            .provision(&repo, &creds, &self.options)
            .await
            .inspect_err(|e| tracing::error!(error = ?e, "sandbox provision failed"))?;

        self.registry
            .set_sandbox(&record.chat_id, &provisioned.id.0)
            .await?;
        self.registry
            .set_status(&record.chat_id, SandboxStatus::Ready)
            .await?;
        Ok(provisioned.connection)
    }
}

#[async_trait]
impl CodingSessionService for CodingSessionServiceImpl {
    #[tracing::instrument(skip(self), fields(repo = %repo.full_name()), err)]
    async fn select_repository(
        &self,
        chat_id: &str,
        user_id: &str,
        repo: RepoRef,
    ) -> Result<SandboxRecord> {
        let record = SandboxRecord {
            chat_id: chat_id.to_string(),
            user_id: user_id.to_string(),
            repo: repo.full_name(),
            backend: self.backend.id(),
            sandbox_id: None,
            status: SandboxStatus::Provisioning,
            work_branch: None,
            snapshot_id: None,
        };
        self.registry.upsert(&record).await?;

        // Pre-warm in the background so the dropdown returns immediately.
        let this = self.clone();
        let record_clone = record.clone();
        let user_id = user_id.to_string();
        tokio::spawn(async move {
            if let Err(e) = this.ensure_connection(&record_clone, &user_id).await {
                tracing::warn!(error = ?e, chat_id = %record_clone.chat_id, "pre-warm failed");
                let _ = this
                    .registry
                    .set_status(&record_clone.chat_id, SandboxStatus::Error)
                    .await;
            }
        });

        Ok(record)
    }

    #[tracing::instrument(skip(self), err)]
    async fn clear_repository(&self, chat_id: &str) -> Result<()> {
        if let Some(record) = self.registry.get(chat_id).await? {
            if let Some(sandbox_id) = record.sandbox_id {
                let _ = self.backend.provider.destroy(&SandboxId(sandbox_id)).await;
            }
        }
        self.registry.delete(chat_id).await
    }

    async fn get_record(&self, chat_id: &str) -> Result<Option<SandboxRecord>> {
        self.registry.get(chat_id).await
    }

    #[tracing::instrument(skip(self), err)]
    async fn warm_on_activity(&self, chat_id: &str, user_id: &str) -> Result<()> {
        let Some(record) = self.registry.get(chat_id).await? else {
            // No repo selected for this chat; nothing to warm.
            return Ok(());
        };

        // Warm in the background; activity should never block the chat turn.
        let this = self.clone();
        let user_id = user_id.to_string();
        tokio::spawn(async move {
            if let Err(e) = this.ensure_connection(&record, &user_id).await {
                tracing::warn!(error = ?e, chat_id = %record.chat_id, "warm-on-activity failed");
            }
        });
        Ok(())
    }

    async fn can_delegate(&self, chat_id: &str) -> Result<bool> {
        Ok(self.registry.get(chat_id).await?.is_some())
    }

    async fn list_repositories(&self, user_id: &str) -> Result<Vec<RepoRef>> {
        self.repos.list_for_user(user_id).await
    }

    #[tracing::instrument(skip(self, prompt, sink), err)]
    async fn delegate(
        &self,
        chat_id: &str,
        user_id: &str,
        prompt: &str,
        sink: CodingEventSink,
    ) -> Result<CodingOutcome> {
        let record = self
            .registry
            .get(chat_id)
            .await?
            .ok_or(CodingError::NoRepositorySelected)?;
        let repo = record
            .repo_ref()
            .ok_or_else(|| CodingError::registry(format!("invalid repo {}", record.repo)))?;

        let connection = self.ensure_connection(&record, user_id).await?;
        let creds = self.credentials.credentials_for(user_id, &repo).await?;

        let work_branch = record
            .work_branch
            .clone()
            .unwrap_or_else(|| default_work_branch(chat_id));
        let task = CodingTask {
            prompt: prompt.to_string(),
            base_branch: repo.default_branch.clone(),
            work_branch: work_branch.clone(),
        };

        sink.emit(CodingEvent::SessionStarted {
            sandbox_id: connection.sandbox_id.0.clone(),
            repo: repo.full_name(),
            branch: work_branch.clone(),
        });

        // Persist the working branch so follow-ups reuse it.
        let mut updated = record.clone();
        updated.work_branch = Some(work_branch);
        self.registry.upsert(&updated).await?;

        let outcome = self
            .backend
            .runner
            .run(&connection, &task, &creds, self.policy, sink.clone())
            .await;

        match outcome {
            Ok(outcome) => {
                // Snapshot for a cheap warm resume on the next turn, best-effort.
                if let Ok(Some(snapshot)) =
                    self.backend.provider.snapshot(&connection.sandbox_id).await
                {
                    let _ = self.registry.set_snapshot(chat_id, &snapshot).await;
                }
                self.registry
                    .set_status(chat_id, SandboxStatus::Sleeping)
                    .await?;
                Ok(outcome)
            }
            Err(e) => {
                sink.emit(CodingEvent::Error {
                    message: e.to_string(),
                });
                sink.emit(CodingEvent::Finished {
                    stop_reason: StopReason::Refusal,
                    pr: None,
                    summary: format!("Coding agent failed: {e}"),
                });
                self.registry
                    .set_status(chat_id, SandboxStatus::Error)
                    .await?;
                Err(e)
            }
        }
    }
}

/// Deterministic working branch name for a chat.
fn default_work_branch(chat_id: &str) -> String {
    let short: String = chat_id
        .chars()
        .filter(|c| c.is_alphanumeric())
        .take(8)
        .collect();
    format!("macro/chat-{short}")
}

#[cfg(test)]
mod test;
