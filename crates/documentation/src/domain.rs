//! Domain logic for documentation sites.

/// Domain models, value objects, and errors.
pub mod model;

/// Ports (traits) required by the documentation domain.
pub mod ports;

/// The documentation service implementation.
pub mod service;

/// The static site generator: markdown + nav tree in, static files out.
pub mod ssg;
