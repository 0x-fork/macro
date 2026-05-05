//! A tool router is a collection of toolsets.
//! Unlike a toolset, tool routers are dynamically mutable.
//! Routers are used to build requests to providers. Tool
//! calls are then dispatched to toolsets via the router.
//!
//! Routers are used to prevent name collisions, and to
//! allow the client to keep few in-context until a
//! user requests functionality from a toolset.
//!
//! Name collisions are prevented with name mangling.

mod mangled;
mod name;
mod router;

#[cfg(test)]
mod test;

pub use router::ToolRouter;
