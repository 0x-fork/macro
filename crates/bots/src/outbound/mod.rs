//! Outbound adapters for bots.

#[cfg(feature = "agent")]
/// In-process agent-loop responder.
pub mod agent_loop_responder;
#[cfg(feature = "outbound")]
/// Postgres bot repository.
pub mod pg_bots_repo;
