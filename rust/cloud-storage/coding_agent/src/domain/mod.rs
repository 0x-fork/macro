//! The vendor-neutral coding-agent contract.
//!
//! [`models`] holds the normalized types every provider speaks; [`ports`]
//! holds the [`CodingAgentProvider`](ports::CodingAgentProvider) trait that
//! backends implement.

pub mod models;
pub mod ports;
