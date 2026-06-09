//! Microsoft Graph delta-query models.
//!
//! Outlook does not expose a Gmail-style monotonic `historyId`. Instead, change
//! tracking is done with [delta queries]: an initial sync returns a page of
//! messages plus an opaque `@odata.deltaLink`; calling that link later returns
//! only the items that changed since, again ending in a fresh `@odata.deltaLink`.
//!
//! This is the Outlook analogue of [`crate::gmail::history`]. The persisted
//! delta link plays the role of the persisted `historyId`.
//!
//! [delta queries]: https://learn.microsoft.com/en-us/graph/delta-query-messages

use super::MessageResource;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

/// Annotation present on a delta item that represents a removed (deleted) message.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Removed {
    /// `"deleted"` for hard deletes, `"changed"` for soft deletes/moves.
    #[serde(default)]
    pub reason: Option<String>,
}

/// A single entry in a delta page. Either a (partial) message that was created
/// or updated, or a `@removed` marker carrying just the id.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DeltaItem {
    /// Present only when the item was removed.
    #[serde(rename = "@removed", default)]
    pub removed: Option<Removed>,
    /// The message fields. For `@removed` items only `id` is meaningful; every
    /// other field falls back to its default.
    #[serde(flatten)]
    pub message: MessageResource,
}

impl DeltaItem {
    /// Whether this entry represents a removed (deleted) message.
    pub fn is_removed(&self) -> bool {
        self.removed.is_some()
    }
}

/// One page of a delta response. Exactly one of `next_link` / `delta_link` is
/// typically set: `next_link` while more pages remain, `delta_link` on the last
/// page.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DeltaResponse {
    #[serde(default)]
    pub value: Vec<DeltaItem>,
    /// Opaque URL to fetch the next page of the current sync.
    #[serde(rename = "@odata.nextLink", default)]
    pub next_link: Option<String>,
    /// Opaque URL to persist and re-use for the next incremental sync.
    #[serde(rename = "@odata.deltaLink", default)]
    pub delta_link: Option<String>,
}

/// The curated set of changes derived from walking every page of a delta sync.
///
/// Outlook analogue of [`crate::gmail::history::InboxChanges`]. Because Graph
/// returns the full updated message body (not just label deltas), there is no
/// separate "labels to update" bucket — an updated message is simply upserted.
#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct DeltaChanges {
    /// Provider message ids that are new or were updated and need upserting.
    pub message_ids_to_upsert: HashSet<String>,
    /// Provider message ids that were removed and need deleting locally.
    pub message_ids_to_delete: HashSet<String>,
    /// The `@odata.deltaLink` to persist for the next incremental sync.
    pub delta_link: Option<String>,
}

/// Database representation of a stored Outlook delta link for a link/folder.
///
/// Outlook analogue of [`crate::gmail::history::GmailHistoryDb`]. We track the
/// delta link per (link, folder) since Graph delta is scoped to a single folder.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlookDeltaDb {
    pub link_id: Uuid,
    /// The mail folder this delta link tracks (typically the well-known inbox id).
    pub folder_id: String,
    pub delta_link: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_mixed_delta_page() {
        let json = r#"{
            "value": [
                { "id": "msg-new", "subject": "New", "isRead": false },
                { "id": "msg-gone", "@removed": { "reason": "deleted" } }
            ],
            "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=abc"
        }"#;

        let page: DeltaResponse = serde_json::from_str(json).unwrap();
        assert_eq!(page.value.len(), 2);

        let new = &page.value[0];
        assert!(!new.is_removed());
        assert_eq!(new.message.id, "msg-new");
        assert_eq!(new.message.subject.as_deref(), Some("New"));

        let gone = &page.value[1];
        assert!(gone.is_removed());
        assert_eq!(gone.message.id, "msg-gone");
        assert_eq!(gone.removed.as_ref().unwrap().reason.as_deref(), Some("deleted"));

        assert!(page.delta_link.is_some());
        assert!(page.next_link.is_none());
    }
}
