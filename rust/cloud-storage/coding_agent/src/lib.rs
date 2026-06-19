//! Provider-agnostic contract for orchestrating cloud coding agents.
//!
//! Macro can spawn a coding agent (e.g. a Cursor Cloud / background agent) on a
//! repository, follow up with it, stop it, and subscribe to its status. Rather
//! than coupling to a single vendor, this crate defines a generic
//! [`CodingAgentProvider`](domain::ports::CodingAgentProvider) contract plus a
//! set of normalized domain models, then implements that contract once per
//! backend.
//!
//! # Architecture
//!
//! - [`domain`] — the vendor-neutral contract: normalized models
//!   ([`domain::models`]) and the [`CodingAgentProvider`](domain::ports::CodingAgentProvider)
//!   trait ([`domain::ports`]). Always compiled.
//! - [`outbound`] — adapters that implement the contract against a third-party
//!   API. The first implementation is [`outbound::cursor::CursorAgentProvider`].
//!   Gated behind the `outbound` feature.
//! - [`inbound`] — the AI toolset that lets the Macro agent drive a provider
//!   (spawn / status / follow-up). Gated behind the `inbound` feature.
//!
//! Adding a new backend (Devin, GitHub Copilot coding agent, an in-house
//! runner, ...) means implementing [`CodingAgentProvider`](domain::ports::CodingAgentProvider)
//! once in [`outbound`]; every caller — including the AI tools — keeps working
//! unchanged because they only ever see the normalized models.

#![deny(missing_docs)]

pub mod domain;

#[cfg(feature = "inbound")]
pub mod inbound;

#[cfg(feature = "outbound")]
pub mod outbound;
