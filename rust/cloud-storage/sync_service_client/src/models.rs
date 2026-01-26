//! Sync service models.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Version ID for sync service.
#[derive(Serialize, Deserialize, Debug, PartialEq, Eq, Clone, ToSchema)]
pub struct SyncServiceVersionID {
    /// The peer identifier
    pub peer: String,
    /// The counter value
    pub counter: i32,
}

/// A peer with its user id.
#[derive(Serialize, Deserialize, Debug, PartialEq, Eq, Clone, ToSchema)]
pub struct PeerWithUserId {
    /// The peer id
    pub peer_id: String,
    /// The user id
    pub user_id: String,
}

/// Document metadata from the sync service.
#[derive(Serialize, Deserialize, Debug, Clone, ToSchema)]
pub struct DocumentMetadata {
    /// The document id
    pub id: String,
    /// The peers with access to the document
    pub peers: Vec<PeerWithUserId>,
    /// The version id
    pub version_id: String,
}
