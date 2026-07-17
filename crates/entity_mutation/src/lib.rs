//! Unified entity mutation domain contract.
//!
//! This crate defines the canonical mutation vocabulary used by API adapters.
//! Concrete services preserve each entity domain's authorization and business
//! rules while presenting one capability-oriented surface to callers.
#![deny(missing_docs)]

mod models;
mod ports;

pub use models::{
    DuplicateEntityRequest, EntityMutationActor, EntityMutationError, EntityMutationErrorCode,
    EntityMutationOutcome, EntityRef, MoveEntityRequest, RenameEntityRequest,
    UpdateEntitySharePolicyRequest,
};
pub use ports::{EntityMutationService, UnavailableEntityMutationService};
