//! Domain layer for bots.

#[cfg(feature = "agent")]
/// In-process Macro agent handler for agent bot mentions.
pub mod agent;
/// Bot lifecycle event contracts.
pub mod events;
/// Bot domain models.
pub mod models;
#[cfg(feature = "ports")]
/// Bot ports.
pub mod ports;
#[cfg(feature = "ports")]
/// Bot service.
pub mod service;
#[cfg(test)]
pub(crate) mod test_support;
/// Token utilities.
pub mod tokens;
#[cfg(feature = "agent")]
/// Routing of mention events to agent bots.
pub mod triggers;
