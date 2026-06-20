//! In-memory, scripted backend + registry + credential provider.
//!
//! This lets the entire delegation pipeline — repo select, pre-warm, the
//! agent-loop handoff, the ACP-style event stream and the PR result — run
//! end-to-end with no Daytona, no Anthropic and no Postgres. It is the default
//! backend in local/test environments and the substrate for unit tests.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;

use crate::domain::error::{CodingError, Result};
use crate::domain::models::{
    CodingEvent, CodingOutcome, CodingTask, GitCredentials, PermissionPolicy, PlanEntry,
    PlanStatus, PrResult, ProvisionedSandbox, RepoRef, SandboxConnection, SandboxId,
    SandboxOptions, SandboxRecord, SandboxStatus, StopReason, ToolCallStatus, ToolKind,
};
use crate::domain::ports::{
    AgentRunner, CodingBackend, CodingEventSink, GitCredentialProvider, RepositoryLister,
    SandboxProvider, SandboxRegistry,
};
use crate::domain::service::CodingSessionService;

/// An in-memory sandbox provider that hands out fake connections.
#[derive(Default)]
pub struct InMemoryProvider {
    sandboxes: Mutex<HashMap<String, SandboxStatus>>,
}

impl InMemoryProvider {
    /// Create an empty provider.
    pub fn new() -> Self {
        Self::default()
    }

    fn connection(id: &str) -> SandboxConnection {
        SandboxConnection {
            sandbox_id: SandboxId(id.to_string()),
            agent_socket_url: format!("mock://{id}/agent"),
            workdir: "/workspace/repo".to_string(),
        }
    }
}

#[async_trait]
impl SandboxProvider for InMemoryProvider {
    fn name(&self) -> &'static str {
        "mock"
    }

    async fn provision(
        &self,
        _repo: &RepoRef,
        _creds: &GitCredentials,
        _opts: &SandboxOptions,
    ) -> Result<ProvisionedSandbox> {
        let id = format!("sbx_{}", uuid::Uuid::new_v4().simple());
        self.sandboxes
            .lock()
            .unwrap()
            .insert(id.clone(), SandboxStatus::Ready);
        Ok(ProvisionedSandbox {
            id: SandboxId(id.clone()),
            connection: Self::connection(&id),
        })
    }

    async fn ensure_warm(&self, sandbox_id: &SandboxId) -> Result<SandboxConnection> {
        let mut map = self.sandboxes.lock().unwrap();
        if !map.contains_key(&sandbox_id.0) {
            return Err(CodingError::sandbox("sandbox not found"));
        }
        map.insert(sandbox_id.0.clone(), SandboxStatus::Ready);
        Ok(Self::connection(&sandbox_id.0))
    }

    async fn status(&self, sandbox_id: &SandboxId) -> Result<SandboxStatus> {
        Ok(self
            .sandboxes
            .lock()
            .unwrap()
            .get(&sandbox_id.0)
            .copied()
            .unwrap_or(SandboxStatus::None))
    }

    async fn snapshot(&self, sandbox_id: &SandboxId) -> Result<Option<String>> {
        Ok(Some(format!("{}-snap", sandbox_id.0)))
    }

    async fn stop(&self, sandbox_id: &SandboxId) -> Result<()> {
        self.sandboxes
            .lock()
            .unwrap()
            .insert(sandbox_id.0.clone(), SandboxStatus::Sleeping);
        Ok(())
    }

    async fn destroy(&self, sandbox_id: &SandboxId) -> Result<()> {
        self.sandboxes.lock().unwrap().remove(&sandbox_id.0);
        Ok(())
    }
}

/// An agent runner that emits a believable, scripted coding session.
pub struct ScriptedRunner {
    /// Delay between scripted events; set to zero in tests.
    step_delay: Duration,
}

impl Default for ScriptedRunner {
    fn default() -> Self {
        Self {
            step_delay: Duration::from_millis(250),
        }
    }
}

impl ScriptedRunner {
    /// A runner with no inter-event delay (for fast tests).
    pub fn instant() -> Self {
        Self {
            step_delay: Duration::ZERO,
        }
    }

    async fn pause(&self) {
        if !self.step_delay.is_zero() {
            tokio::time::sleep(self.step_delay).await;
        }
    }
}

#[async_trait]
impl AgentRunner for ScriptedRunner {
    fn name(&self) -> &'static str {
        "mock"
    }

    async fn run(
        &self,
        _connection: &SandboxConnection,
        task: &CodingTask,
        _creds: &GitCredentials,
        _policy: PermissionPolicy,
        sink: CodingEventSink,
    ) -> Result<CodingOutcome> {
        sink.emit(CodingEvent::Plan {
            entries: vec![
                PlanEntry {
                    content: "Understand the request".to_string(),
                    status: PlanStatus::InProgress,
                },
                PlanEntry {
                    content: "Make the change".to_string(),
                    status: PlanStatus::Pending,
                },
                PlanEntry {
                    content: "Run tests and open a PR".to_string(),
                    status: PlanStatus::Pending,
                },
            ],
        });
        self.pause().await;

        sink.emit(CodingEvent::ToolCall {
            id: "tc1".to_string(),
            title: "Search the codebase".to_string(),
            kind: ToolKind::Search,
            status: ToolCallStatus::InProgress,
        });
        self.pause().await;
        sink.emit(CodingEvent::ToolUpdate {
            id: "tc1".to_string(),
            status: ToolCallStatus::Completed,
            output: Some("Found 3 relevant files".to_string()),
        });

        sink.emit(CodingEvent::Message {
            text: format!("Working on: {}", task.prompt),
        });
        self.pause().await;

        sink.emit(CodingEvent::ToolCall {
            id: "tc2".to_string(),
            title: "Edit src/example.rs".to_string(),
            kind: ToolKind::Edit,
            status: ToolCallStatus::InProgress,
        });
        sink.emit(CodingEvent::Diff {
            path: "src/example.rs".to_string(),
            old_text: Some("fn greet() {}\n".to_string()),
            new_text: "fn greet() {\n    println!(\"hello from macro\");\n}\n".to_string(),
        });
        sink.emit(CodingEvent::ToolUpdate {
            id: "tc2".to_string(),
            status: ToolCallStatus::Completed,
            output: None,
        });
        self.pause().await;

        sink.emit(CodingEvent::ToolCall {
            id: "tc3".to_string(),
            title: "Run test suite".to_string(),
            kind: ToolKind::Execute,
            status: ToolCallStatus::InProgress,
        });
        self.pause().await;
        sink.emit(CodingEvent::ToolUpdate {
            id: "tc3".to_string(),
            status: ToolCallStatus::Completed,
            output: Some("test result: ok. 12 passed".to_string()),
        });

        let pr = PrResult {
            url: "https://github.com/example/repo/pull/42".to_string(),
            number: 42,
            branch: task.work_branch.clone(),
            title: format!("macro: {}", truncate(&task.prompt, 60)),
            changed_files: Some(1),
        };
        let summary = format!(
            "Implemented the request on branch `{}` and opened PR #{}.",
            task.work_branch, pr.number
        );
        sink.emit(CodingEvent::Finished {
            stop_reason: StopReason::EndTurn,
            pr: Some(pr.clone()),
            summary: summary.clone(),
        });

        Ok(CodingOutcome {
            stop_reason: StopReason::EndTurn,
            pr: Some(pr),
            summary,
        })
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push('…');
        out
    }
}

/// The fully in-memory backend (provider + runner).
pub fn mock_backend() -> CodingBackend {
    CodingBackend::new(
        Arc::new(InMemoryProvider::new()),
        Arc::new(ScriptedRunner::default()),
    )
}

/// A thread-safe in-memory [`SandboxRegistry`] for local/dev/tests.
#[derive(Default)]
pub struct InMemoryRegistry {
    records: Mutex<HashMap<String, SandboxRecord>>,
}

impl InMemoryRegistry {
    /// Create an empty registry.
    pub fn new() -> Self {
        Self::default()
    }
}

#[async_trait]
impl SandboxRegistry for InMemoryRegistry {
    async fn get(&self, chat_id: &str) -> Result<Option<SandboxRecord>> {
        Ok(self.records.lock().unwrap().get(chat_id).cloned())
    }

    async fn upsert(&self, record: &SandboxRecord) -> Result<()> {
        self.records
            .lock()
            .unwrap()
            .insert(record.chat_id.clone(), record.clone());
        Ok(())
    }

    async fn set_status(&self, chat_id: &str, status: SandboxStatus) -> Result<()> {
        if let Some(r) = self.records.lock().unwrap().get_mut(chat_id) {
            r.status = status;
        }
        Ok(())
    }

    async fn set_sandbox(&self, chat_id: &str, sandbox_id: &str) -> Result<()> {
        if let Some(r) = self.records.lock().unwrap().get_mut(chat_id) {
            r.sandbox_id = Some(sandbox_id.to_string());
            r.status = SandboxStatus::Ready;
        }
        Ok(())
    }

    async fn set_snapshot(&self, chat_id: &str, snapshot_id: &str) -> Result<()> {
        if let Some(r) = self.records.lock().unwrap().get_mut(chat_id) {
            r.snapshot_id = Some(snapshot_id.to_string());
        }
        Ok(())
    }

    async fn delete(&self, chat_id: &str) -> Result<()> {
        self.records.lock().unwrap().remove(chat_id);
        Ok(())
    }
}

/// A credential provider that returns a single static token (e.g. from a
/// `GITHUB_TOKEN` env var) for every request. Useful for local development.
pub struct StaticCredentialProvider {
    username: String,
    token: String,
}

impl StaticCredentialProvider {
    /// Build a provider for a fixed token.
    pub fn new(token: impl Into<String>) -> Self {
        Self {
            username: "x-access-token".to_string(),
            token: token.into(),
        }
    }
}

#[async_trait]
impl GitCredentialProvider for StaticCredentialProvider {
    async fn credentials_for(&self, _user_id: &str, _repo: &RepoRef) -> Result<GitCredentials> {
        Ok(GitCredentials {
            username: self.username.clone(),
            token: self.token.clone(),
        })
    }
}

/// A [`RepositoryLister`] that returns a fixed list (e.g. from configuration).
#[derive(Default)]
pub struct StaticRepositoryLister {
    repos: Vec<RepoRef>,
}

impl StaticRepositoryLister {
    /// Build a lister from `owner/name` strings (invalid entries are skipped).
    pub fn from_full_names<I, S>(names: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        Self {
            repos: names
                .into_iter()
                .filter_map(|n| RepoRef::parse(n.as_ref()))
                .collect(),
        }
    }
}

#[async_trait]
impl RepositoryLister for StaticRepositoryLister {
    async fn list_for_user(&self, _user_id: &str) -> Result<Vec<RepoRef>> {
        Ok(self.repos.clone())
    }
}

/// A [`CodingSessionService`] that does nothing — used as the default in hosts
/// that wire the tools but do not enable the coding-agent feature (e.g. the MCP
/// server, memory service). Active operations return an error; queries report
/// "no sandbox".
#[derive(Default)]
pub struct NoopCodingService;

#[async_trait]
impl CodingSessionService for NoopCodingService {
    async fn select_repository(
        &self,
        _chat_id: &str,
        _user_id: &str,
        _repo: RepoRef,
    ) -> Result<SandboxRecord> {
        Err(CodingError::sandbox(
            "coding-agent backend is not configured",
        ))
    }

    async fn clear_repository(&self, _chat_id: &str) -> Result<()> {
        Ok(())
    }

    async fn get_record(&self, _chat_id: &str) -> Result<Option<SandboxRecord>> {
        Ok(None)
    }

    async fn warm_on_activity(&self, _chat_id: &str, _user_id: &str) -> Result<()> {
        Ok(())
    }

    async fn can_delegate(&self, _chat_id: &str) -> Result<bool> {
        Ok(false)
    }

    async fn list_repositories(&self, _user_id: &str) -> Result<Vec<RepoRef>> {
        Ok(Vec::new())
    }

    async fn delegate(
        &self,
        _chat_id: &str,
        _user_id: &str,
        _prompt: &str,
        _sink: CodingEventSink,
    ) -> Result<CodingOutcome> {
        Err(CodingError::sandbox(
            "coding-agent backend is not configured",
        ))
    }
}
