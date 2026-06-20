//! Ports: the trait seams that make every layer swappable.

use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::mpsc;

use super::error::Result;
use super::models::{
    CodingEvent, CodingOutcome, CodingTask, GitCredentials, PermissionPolicy, ProvisionedSandbox,
    RepoRef, SandboxConnection, SandboxId, SandboxOptions, SandboxRecord, SandboxStatus,
};

/// A sink the agent runner uses to stream [`CodingEvent`]s back to the caller
/// as they happen. Cloning is cheap; dropping all clones ends the stream.
///
/// Backed by an unbounded channel so a slow consumer never blocks the agent.
/// When no sink is wired (e.g. a background pre-warm with nobody listening)
/// [`CodingEventSink::noop`] swallows events.
#[derive(Clone, Default)]
pub struct CodingEventSink {
    tx: Option<mpsc::UnboundedSender<CodingEvent>>,
}

impl CodingEventSink {
    /// Create a sink/stream pair. Events sent to the sink arrive on the
    /// receiver in order.
    pub fn channel() -> (Self, mpsc::UnboundedReceiver<CodingEvent>) {
        let (tx, rx) = mpsc::unbounded_channel();
        (Self { tx: Some(tx) }, rx)
    }

    /// A sink that discards everything.
    pub fn noop() -> Self {
        Self { tx: None }
    }

    /// Emit an event. Never blocks; silently drops if the receiver is gone.
    pub fn emit(&self, event: CodingEvent) {
        if let Some(tx) = &self.tx {
            let _ = tx.send(event);
        }
    }
}

impl std::fmt::Debug for CodingEventSink {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CodingEventSink")
            .field("connected", &self.tx.is_some())
            .finish()
    }
}

/// Provisions and manages the lifecycle of an isolated sandbox.
///
/// Implementations: [`crate::outbound::daytona::DaytonaSandboxProvider`],
/// [`crate::outbound::mock::InMemoryProvider`].
#[async_trait]
pub trait SandboxProvider: Send + Sync {
    /// Stable identifier for this provider (e.g. `daytona`).
    fn name(&self) -> &'static str;

    /// Provision a sandbox, clone `repo` into it using `creds`, and return a
    /// connection the agent runner can use.
    async fn provision(
        &self,
        repo: &RepoRef,
        creds: &GitCredentials,
        opts: &SandboxOptions,
    ) -> Result<ProvisionedSandbox>;

    /// Ensure an existing sandbox is awake and ready (resume from sleep).
    async fn ensure_warm(&self, sandbox_id: &SandboxId) -> Result<SandboxConnection>;

    /// Current status of a sandbox.
    async fn status(&self, sandbox_id: &SandboxId) -> Result<SandboxStatus>;

    /// Snapshot a sandbox for cheap warm resumes; returns the snapshot id.
    async fn snapshot(&self, sandbox_id: &SandboxId) -> Result<Option<String>>;

    /// Idle/stop a sandbox to save cost (retaining state where supported).
    async fn stop(&self, sandbox_id: &SandboxId) -> Result<()>;

    /// Permanently destroy a sandbox.
    async fn destroy(&self, sandbox_id: &SandboxId) -> Result<()>;
}

/// Drives an autonomous coding agent inside a provisioned sandbox.
///
/// Implementations: [`crate::outbound::acp::AcpClaudeCodeRunner`],
/// [`crate::outbound::mock::ScriptedRunner`].
#[async_trait]
pub trait AgentRunner: Send + Sync {
    /// Stable identifier for this runner (e.g. `claude_code`).
    fn name(&self) -> &'static str;

    /// Run `task` to completion, streaming progress to `sink`, and return the
    /// terminal outcome. `creds` are available for the final push + PR.
    ///
    /// The runner resolves permission requests according to `policy`.
    async fn run(
        &self,
        connection: &SandboxConnection,
        task: &CodingTask,
        creds: &GitCredentials,
        policy: PermissionPolicy,
        sink: CodingEventSink,
    ) -> Result<CodingOutcome>;
}

/// A coding backend is the swappable composition of a sandbox provider and an
/// agent runner. Changing vendors means constructing this with different parts.
#[derive(Clone)]
pub struct CodingBackend {
    /// The sandbox provider half.
    pub provider: Arc<dyn SandboxProvider>,
    /// The agent runner half.
    pub runner: Arc<dyn AgentRunner>,
}

impl CodingBackend {
    /// Compose a provider and a runner into a backend.
    pub fn new(provider: Arc<dyn SandboxProvider>, runner: Arc<dyn AgentRunner>) -> Self {
        Self { provider, runner }
    }

    /// A stable identifier for the composed backend, e.g. `daytona+claude_code`.
    pub fn id(&self) -> String {
        format!("{}+{}", self.provider.name(), self.runner.name())
    }
}

impl std::fmt::Debug for CodingBackend {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CodingBackend")
            .field("id", &self.id())
            .finish()
    }
}

/// Persists the chat ↔ sandbox mapping (one sandbox per chat).
///
/// Implementations: [`crate::outbound::pg_registry::PgSandboxRegistry`],
/// [`crate::outbound::mock::InMemoryRegistry`].
#[async_trait]
pub trait SandboxRegistry: Send + Sync {
    /// Fetch the record for a chat, if one exists.
    async fn get(&self, chat_id: &str) -> Result<Option<SandboxRecord>>;

    /// Insert or replace the record for a chat.
    async fn upsert(&self, record: &SandboxRecord) -> Result<()>;

    /// Update just the lifecycle status for a chat.
    async fn set_status(&self, chat_id: &str, status: SandboxStatus) -> Result<()>;

    /// Record the provisioned sandbox id (and reset status to ready).
    async fn set_sandbox(&self, chat_id: &str, sandbox_id: &str) -> Result<()>;

    /// Record the latest snapshot id for warm resumes.
    async fn set_snapshot(&self, chat_id: &str, snapshot_id: &str) -> Result<()>;

    /// Remove the record for a chat.
    async fn delete(&self, chat_id: &str) -> Result<()>;
}

/// Resolves git credentials for a user + repository. Decoupled from the GitHub
/// integration so the credential source can change independently.
#[async_trait]
pub trait GitCredentialProvider: Send + Sync {
    /// Obtain credentials that can clone, push and open a PR on `repo` for
    /// `user_id`.
    async fn credentials_for(&self, user_id: &str, repo: &RepoRef) -> Result<GitCredentials>;
}

/// Lists the repositories a user can have the agent work on (those reachable
/// through their GitHub integration). Powers the chat repository dropdown.
#[async_trait]
pub trait RepositoryLister: Send + Sync {
    /// Repositories available to `user_id`.
    async fn list_for_user(&self, user_id: &str) -> Result<Vec<RepoRef>>;
}
