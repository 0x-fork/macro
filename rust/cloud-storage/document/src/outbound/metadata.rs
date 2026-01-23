use crate::domain::ports::DocumentMetadataRepo;
use sqlx::PgPool;
use std::sync::Arc;

pub struct MetadatRepo {
    db: Arc<PgPool>,
}
