//! Outbound adapters implementing the domain ports for concrete vendors.
//!
//! * [`mock`] — in-memory, scripted backend (no external services).
//! * [`daytona`] — Daytona sandbox provider (HTTP), behind the `daytona` feature.
//! * [`acp`] — Claude Code agent runner over ACP, behind the `acp` feature.
//! * [`pg_registry`] — Postgres-backed [`SandboxRegistry`], behind `postgres`.
//!
//! [`SandboxRegistry`]: crate::domain::ports::SandboxRegistry

pub mod mock;

#[cfg(feature = "daytona")]
pub mod daytona;

#[cfg(feature = "acp")]
pub mod acp;

#[cfg(feature = "postgres")]
pub mod pg_registry;
