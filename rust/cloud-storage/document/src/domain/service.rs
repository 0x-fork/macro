//! why do you need a comment
use super::ports::DocumentRepo;
use entity_access::domain::ports::EntityAccessService;
use std::sync::Arc;

/// an impl
pub struct DocumentServiceImpl<EntityAccess, DocStorage>
where
    EntityAccess: EntityAccessService,
    DocStorage: DocumentRepo,
{
    entity_access: Arc<EntityAccess>,
    repo: Arc<DocStorage>,
}
