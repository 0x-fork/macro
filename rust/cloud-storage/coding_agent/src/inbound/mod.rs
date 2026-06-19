//! Inbound adapters.
//!
//! - [`routing`] — stateless, signed routing tokens that let a status webhook
//!   be delivered back to the user/conversation that spawned the agent, without
//!   any server-side state.
//! - [`webhook`] — a framework-agnostic webhook receiver that verifies a signed
//!   status delivery and dispatches a normalized [`CodingAgentEvent`](crate::domain::models::CodingAgentEvent)
//!   to a [`CodingAgentEventSink`](crate::domain::ports::CodingAgentEventSink).
//! - [`toolset`] — the AI tools the Macro agent calls to spawn, follow up on,
//!   and check the status of coding agents (feature `toolset`).

pub mod routing;
pub mod webhook;

#[cfg(feature = "toolset")]
pub mod toolset;
