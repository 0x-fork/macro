//! Delta-query sync against Microsoft Graph.
//!
//! Drives the [delta query] loop: walk every `@odata.nextLink` page, accumulate
//! created/updated vs removed message ids, and capture the terminal
//! `@odata.deltaLink` to persist for the next incremental sync. This is the
//! Outlook analogue of `gmail_client::history`.
//!
//! [delta query]: https://learn.microsoft.com/en-us/graph/delta-query-messages

use crate::OutlookClient;
use models_email::outlook::delta::{DeltaChanges, DeltaResponse};
use models_email::outlook::error::OutlookError;

/// Build the URL that starts a fresh delta enumeration of a folder.
///
/// We only `$select` ids/state here: a delta page can be large, and the worker
/// re-fetches full bodies for the ids it decides to upsert. `parentFolderId` is
/// included so the worker can resolve the message's folder → system label.
pub(crate) fn initial_delta_url(base_url: &str, folder_id: &str) -> String {
    format!(
        "{}/me/mailFolders/{}/messages/delta?$select=id,conversationId,parentFolderId,isRead",
        base_url, folder_id
    )
}

/// Walk a delta sync to completion starting from `start_url` (either an initial
/// delta URL or a persisted `@odata.deltaLink`) and return the aggregated changes.
pub(crate) async fn run_delta(
    client: &OutlookClient,
    access_token: &str,
    start_url: &str,
) -> Result<DeltaChanges, OutlookError> {
    let mut changes = DeltaChanges::default();
    let mut next_url = Some(start_url.to_string());

    while let Some(url) = next_url.take() {
        let page: DeltaResponse = client.graph_get(access_token, &url).await?;

        for item in page.value {
            let id = item.message.id.clone();
            if id.is_empty() {
                continue;
            }
            if item.is_removed() {
                // A message can be both updated and later removed within one
                // sync window; deletion wins.
                changes.message_ids_to_upsert.remove(&id);
                changes.message_ids_to_delete.insert(id);
            } else if !changes.message_ids_to_delete.contains(&id) {
                changes.message_ids_to_upsert.insert(id);
            }
        }

        if let Some(delta_link) = page.delta_link {
            changes.delta_link = Some(delta_link);
            break;
        }
        next_url = page.next_link;
    }

    Ok(changes)
}
