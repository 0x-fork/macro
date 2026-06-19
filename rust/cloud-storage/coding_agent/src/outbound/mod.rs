//! Outbound adapters implementing [`CodingAgentProvider`](crate::domain::ports::CodingAgentProvider).
//!
//! - [`cursor`] — Cursor Cloud Agents.
//! - [`claude`] — Anthropic Claude Managed Agents.

pub mod claude;
pub mod cursor;
