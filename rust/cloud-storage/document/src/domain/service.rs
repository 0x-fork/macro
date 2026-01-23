//! why do you need a comment
use super::ports::{DocumentMetadataRepo, DocumentStorageRepo};
use entity_access::domain::ports::EntityAccessService;
use std::sync::Arc;

/// an impl
pub struct DocumentServiceImpl<EntityAccess, Storage, Metadata>
where
    EntityAccess: EntityAccessService,
    Storage: DocumentStorageRepo,
    Metadata: DocumentMetadataRepo,
{
    entity_access: Arc<EntityAccess>,
    storage: Arc<Storage>,
    metadata: Arc<Metadata>,
}
