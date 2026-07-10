//! Toolset inbound adapter for ai projections.

mod get_projection;

use crate::domain::projection_read_service::AiProjectionReadService;
use ai_toolset::AsyncToolCollection;
use std::sync::Arc;

pub use get_projection::{GetProjection, GetProjectionResponse};

/// Service context for ai projection AI tools.
pub struct AiProjectionToolContext<S: AiProjectionReadService> {
    /// The read-only projection service.
    pub service: Arc<S>,
}

impl<S: AiProjectionReadService> Clone for AiProjectionToolContext<S> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
        }
    }
}

impl<S: AiProjectionReadService> AiProjectionToolContext<S> {
    /// Create a new ai projection tool context.
    pub fn new(service: Arc<S>) -> Self {
        Self { service }
    }
}

/// Create the ai projection toolset.
pub fn ai_projection_toolset<S>() -> AsyncToolCollection<AiProjectionToolContext<S>>
where
    S: AiProjectionReadService,
{
    AsyncToolCollection::new().add_tool::<GetProjection, AiProjectionToolContext<S>>()
}
