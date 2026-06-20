#![deny(missing_docs)]
//! Provider-agnostic interface for delegating coding work to an autonomous
//! coding agent running inside an isolated sandbox.
//!
//! The macro agent stays in control of the conversation and *yields* a coding
//! task to a [`CodingBackend`]. A backend is the composition of two ports:
//!
//! * a [`SandboxProvider`] — provisions/warms/snapshots the isolated
//!   environment (e.g. Daytona, Cloudflare, E2B, Fly Sprites), and
//! * an [`AgentRunner`] — drives an autonomous coding agent inside that
//!   environment (e.g. Claude Code over ACP, Gemini CLI, a custom agent).
//!
//! Both are swappable: the rest of the system depends only on these traits and
//! on the wire-stable [`CodingEvent`] stream, so changing the sandbox vendor or
//! the coding agent never touches the agent loop or the frontend renderer.
//!
//! The default backend is Daytona + Claude Code ([`outbound::daytona`] +
//! [`outbound::acp`]). An in-memory scripted backend ([`outbound::mock`]) lets
//! the whole pipeline run end-to-end with no external services.
//!
//! [`SandboxProvider`]: crate::domain::ports::SandboxProvider
//! [`AgentRunner`]: crate::domain::ports::AgentRunner
//! [`CodingBackend`]: crate::domain::ports::CodingBackend
//! [`CodingEvent`]: crate::domain::models::CodingEvent

pub mod domain;
pub mod outbound;

pub use domain::error::{CodingError, Result};
pub use domain::models::{
    CodingEvent, CodingOutcome, CodingTask, GitCredentials, PermissionDecision, PermissionOption,
    PermissionPolicy, PlanEntry, PlanStatus, PrResult, ProvisionedSandbox, RepoRef,
    SandboxConnection, SandboxId, SandboxOptions, SandboxRecord, SandboxStatus, StopReason,
    ToolCallStatus, ToolKind,
};
pub use domain::ports::{
    AgentRunner, CodingBackend, CodingEventSink, GitCredentialProvider, RepositoryLister,
    SandboxProvider, SandboxRegistry,
};
pub use domain::service::{CodingSessionService, CodingSessionServiceImpl};

pub use outbound::mock::{
    InMemoryProvider, InMemoryRegistry, NoopCodingService, ScriptedRunner,
    StaticCredentialProvider, StaticRepositoryLister, mock_backend,
};

#[cfg(feature = "github")]
pub use outbound::github::GitHubApiRepositoryLister;
