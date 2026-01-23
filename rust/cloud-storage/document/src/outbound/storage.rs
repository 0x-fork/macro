use s3_client::S3;
use std::sync::Arc;
use sync_service_client::SyncServiceClient;

pub struct StorageRepo {
    sync_service: Arc<SyncServiceClient>,
    s3: Arc<S3>,
}
