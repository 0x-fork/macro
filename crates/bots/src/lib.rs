#![deny(missing_docs)]
//! Bot management hex crate.

/// Domain models, ports, and service.
pub mod domain;
#[cfg(any(feature = "inbound", feature = "agent"))]
/// HTTP and Kafka adapters.
pub mod inbound;
#[cfg(any(feature = "outbound", feature = "agent"))]
/// Postgres and agent-loop adapters.
pub mod outbound;
