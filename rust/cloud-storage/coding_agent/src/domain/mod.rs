//! Domain layer: ports (traits), models, errors and the orchestration service.
//!
//! Nothing in this module depends on a concrete sandbox vendor or coding agent
//! — those live in [`crate::outbound`].

pub mod error;
pub mod models;
pub mod ports;
pub mod service;
