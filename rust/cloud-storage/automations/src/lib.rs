#![recursion_limit = "256"]

//! Agent-backed automations layered on the `scheduled_action` scheduling library.
//!
//! `scheduled_action` is a pure scheduling library (cron schedules, repo,
//! dispatchers, the in-process/lambda executors, HTTP surface) that is agnostic
//! about what a scheduled action actually *does*. This crate supplies the
//! concrete [`ActionRunner`](scheduled_action::domain::ports::ActionRunner) for
//! [`ActionKind::Agent`](scheduled_action::domain::models::ActionKind) actions —
//! [`runner::AgentActionRunner`], which creates a chat thread and runs an AI
//! agent loop (with user memory + tools) — together with the deployable service
//! binary that wires it into the in-process executor.
//!
//! Keeping the agent runner here (rather than in `scheduled_action`) is what
//! lets `memory` depend on `scheduled_action` without a cargo cycle: the
//! `scheduled_action -> memory` edge lives in this crate, not in the scheduling
//! core.

mod agent_task;
mod notify;
pub mod runner;
