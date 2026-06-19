//! Inbound adapters.
//!
//! - [`webhook`] — a framework-agnostic webhook receiver that verifies a signed
//!   status delivery and dispatches a normalized [`CodingAgentEvent`](crate::domain::models::CodingAgentEvent)
//!   to a [`CodingAgentEventSink`](crate::domain::ports::CodingAgentEventSink).
//! - [`toolset`] — the AI tools the Macro agent calls to spawn, follow up on,
//!   and check the status of coding agents (feature `toolset`).

pub mod webhook;

#[cfg(feature = "toolset")]
pub mod toolset;
