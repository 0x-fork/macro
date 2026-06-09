//! The persisted record of a user's Google Drive connection.

use chrono::{DateTime, Utc};
use uuid::Uuid;

/// A row in the `google_drive_links` table: the binding between a Macro user,
/// their FusionAuth identity, and the connected Google account.
///
/// The OAuth refresh token itself is **not** stored here — it lives in
/// FusionAuth (as the identity-provider link). We only persist enough to (a)
/// know the user is connected and (b) resolve the Drive account email that the
/// access-token endpoint keys off.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoogleDriveLink {
    /// Surface id of the link row.
    pub id: Uuid,
    /// The Macro user id that owns this link.
    pub macro_id: String,
    /// The FusionAuth user id, used to retrieve access tokens.
    pub fusionauth_user_id: Uuid,
    /// The connected Google account email (the FusionAuth link `displayName`).
    pub email: String,
    /// When the link was created.
    pub created_at: DateTime<Utc>,
    /// When the link was last updated.
    pub updated_at: DateTime<Utc>,
}
