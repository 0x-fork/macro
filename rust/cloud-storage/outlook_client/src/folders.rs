//! Mail-folder operations against Microsoft Graph.
//!
//! Outlook mail folders are the closest analogue to Gmail labels for the
//! purposes of our label model: a message lives in exactly one folder, and we
//! map the well-known folders (`inbox`, `sentitems`, ...) onto the
//! provider-agnostic system labels.

use crate::OutlookClient;
use chrono::Utc;
use models_email::email::service::label::{
    Label, LabelListVisibility, LabelType, MessageListVisibility,
};
use models_email::outlook::error::OutlookError;
use models_email::outlook::well_known_folder;
use models_email::outlook::{MailFolder, MailFolderListResponse};
use uuid::Uuid;

const FOLDER_SELECT: &str =
    "id,displayName,wellKnownName,parentFolderId,totalItemCount,unreadItemCount";
const PAGE_SIZE: u32 = 100;

/// List the user's mail folders, following pagination. Hidden folders are
/// included so well-known system folders are always present.
pub(crate) async fn list_folders(
    client: &OutlookClient,
    access_token: &str,
) -> Result<Vec<MailFolder>, OutlookError> {
    let mut next_url = Some(format!(
        "{}/me/mailFolders?$select={}&$top={}&includeHiddenFolders=true",
        client.base_url, FOLDER_SELECT, PAGE_SIZE
    ));

    let mut folders = Vec::new();
    while let Some(url) = next_url.take() {
        let page: MailFolderListResponse = client.graph_get(access_token, &url).await?;
        folders.extend(page.value);
        next_url = page.next_link;
    }

    Ok(folders)
}

/// List the user's folders mapped to service labels, ready to persist.
///
/// A well-known folder is emitted as a `System` label whose `provider_label_id`
/// is the provider-agnostic system label (e.g. `INBOX`); a user folder is
/// emitted as a `User` label keyed by its Graph folder id.
pub(crate) async fn fetch_user_labels(
    client: &OutlookClient,
    access_token: &str,
    link_id: Uuid,
) -> Result<Vec<Label>, OutlookError> {
    let folders = list_folders(client, access_token).await?;
    Ok(folders
        .into_iter()
        .map(|folder| folder_to_label(folder, link_id))
        .collect())
}

fn folder_to_label(folder: MailFolder, link_id: Uuid) -> Label {
    let system_label = folder
        .well_known_name
        .as_deref()
        .and_then(well_known_folder::to_system_label);

    let (provider_label_id, name, type_) = match system_label {
        Some(system) => (
            system.to_string(),
            folder.display_name,
            LabelType::System,
        ),
        None => (
            folder.id,
            folder.display_name,
            LabelType::User,
        ),
    };

    Label {
        id: None,
        link_id,
        provider_label_id,
        name,
        created_at: Utc::now(),
        message_list_visibility: Some(MessageListVisibility::Show),
        label_list_visibility: Some(LabelListVisibility::LabelShow),
        type_: Some(type_),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use models_email::email::service::label::system_labels;

    #[test]
    fn well_known_folder_maps_to_system_label() {
        let folder = MailFolder {
            id: "raw-inbox-id".to_string(),
            display_name: Some("Inbox".to_string()),
            well_known_name: Some("inbox".to_string()),
            parent_folder_id: None,
            total_item_count: Some(10),
            unread_item_count: Some(2),
        };
        let label = folder_to_label(folder, Uuid::nil());
        assert_eq!(label.provider_label_id, system_labels::INBOX);
        assert_eq!(label.type_, Some(LabelType::System));
        assert_eq!(label.name.as_deref(), Some("Inbox"));
    }

    #[test]
    fn user_folder_keeps_graph_id() {
        let folder = MailFolder {
            id: "AAMkUserFolderId".to_string(),
            display_name: Some("Receipts".to_string()),
            well_known_name: None,
            parent_folder_id: Some("parent".to_string()),
            total_item_count: None,
            unread_item_count: None,
        };
        let label = folder_to_label(folder, Uuid::nil());
        assert_eq!(label.provider_label_id, "AAMkUserFolderId");
        assert_eq!(label.type_, Some(LabelType::User));
    }
}
