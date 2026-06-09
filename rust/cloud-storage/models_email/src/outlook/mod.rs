//! Microsoft Graph (Outlook) API resource models.
//!
//! These mirror the shape of the structs in [`crate::gmail`] but model the
//! Microsoft Graph `message`, `mailFolder`, and related resources. Callers in
//! the `outlook_client` crate map these raw resources onto the provider-agnostic
//! service-layer structs in [`crate::email::service`].
//!
//! Graph reference: <https://learn.microsoft.com/en-us/graph/api/resources/message>

pub mod delta;
pub mod error;
pub mod subscription;

use serde::{Deserialize, Serialize};

/// A Microsoft Graph `emailAddress` complex type: `{ "name": ..., "address": ... }`.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct EmailAddress {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub address: Option<String>,
}

/// A Microsoft Graph `recipient` complex type, wrapping an [`EmailAddress`].
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct Recipient {
    #[serde(rename = "emailAddress", default)]
    pub email_address: EmailAddress,
}

/// The body of a message. `content_type` is either `"html"` or `"text"`.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ItemBody {
    #[serde(rename = "contentType", default)]
    pub content_type: String,
    #[serde(default)]
    pub content: String,
}

/// A single internet message header (only populated when explicitly `$select`ed).
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct InternetMessageHeader {
    pub name: String,
    pub value: String,
}

/// The follow-up flag on a message. We treat `flagStatus == "flagged"` as the
/// equivalent of a Gmail "starred" message.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct FollowupFlag {
    #[serde(rename = "flagStatus", default)]
    pub flag_status: Option<String>,
}

/// A Microsoft Graph `message` resource.
///
/// Fields are intentionally permissive (`Option` / `#[serde(default)]`) because
/// the exact set returned depends on the `$select` clause used by the caller.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MessageResource {
    pub id: String,
    /// Server-assigned id that changes whenever the message is modified. Useful
    /// for detecting whether a cached copy is stale.
    #[serde(rename = "changeKey", default)]
    pub change_key: Option<String>,
    /// Groups messages into a conversation; the Outlook analogue of a Gmail thread id.
    #[serde(rename = "conversationId", default)]
    pub conversation_id: Option<String>,
    /// The globally-unique RFC 5322 `Message-ID` header value.
    #[serde(rename = "internetMessageId", default)]
    pub internet_message_id: Option<String>,
    #[serde(default)]
    pub subject: Option<String>,
    /// Short preview of the body, used as the snippet.
    #[serde(rename = "bodyPreview", default)]
    pub body_preview: Option<String>,
    #[serde(default)]
    pub body: Option<ItemBody>,
    #[serde(default)]
    pub from: Option<Recipient>,
    #[serde(rename = "toRecipients", default)]
    pub to_recipients: Vec<Recipient>,
    #[serde(rename = "ccRecipients", default)]
    pub cc_recipients: Vec<Recipient>,
    #[serde(rename = "bccRecipients", default)]
    pub bcc_recipients: Vec<Recipient>,
    #[serde(rename = "replyTo", default)]
    pub reply_to: Vec<Recipient>,
    #[serde(rename = "receivedDateTime", default)]
    pub received_date_time: Option<String>,
    #[serde(rename = "sentDateTime", default)]
    pub sent_date_time: Option<String>,
    #[serde(rename = "isRead", default)]
    pub is_read: bool,
    #[serde(rename = "isDraft", default)]
    pub is_draft: bool,
    #[serde(rename = "hasAttachments", default)]
    pub has_attachments: bool,
    /// Approximate size of the message in bytes.
    #[serde(default)]
    pub size: Option<i64>,
    /// The id of the mail folder the message currently lives in.
    #[serde(rename = "parentFolderId", default)]
    pub parent_folder_id: Option<String>,
    /// User-applied categories — the closest Outlook analogue to Gmail user labels.
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub flag: Option<FollowupFlag>,
    #[serde(rename = "internetMessageHeaders", default)]
    pub internet_message_headers: Vec<InternetMessageHeader>,
}

/// Minimal message projection (`$select=id,conversationId,parentFolderId,isRead`)
/// used where we only need ids / folder placement, analogous to Gmail's
/// `MinimalMessageResource`.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MinimalMessageResource {
    pub id: String,
    #[serde(rename = "conversationId", default)]
    pub conversation_id: Option<String>,
    #[serde(rename = "parentFolderId", default)]
    pub parent_folder_id: Option<String>,
    #[serde(rename = "isRead", default)]
    pub is_read: bool,
}

/// A page of messages returned by a list endpoint
/// (`GET /me/messages`, `GET /me/mailFolders/{id}/messages`, ...).
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MessageListResponse {
    #[serde(default)]
    pub value: Vec<MessageResource>,
    /// Opaque URL for the next page, if any.
    #[serde(rename = "@odata.nextLink", default)]
    pub next_link: Option<String>,
}

// -- Folders --

/// A Microsoft Graph `mailFolder` resource. The Outlook analogue of a Gmail label.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MailFolder {
    pub id: String,
    #[serde(rename = "displayName", default)]
    pub display_name: Option<String>,
    /// Stable, locale-independent name for built-in folders, e.g. `"inbox"`,
    /// `"sentitems"`, `"drafts"`, `"junkemail"`, `"deleteditems"`. Only present
    /// when explicitly `$select`ed (`wellKnownName`).
    #[serde(rename = "wellKnownName", default)]
    pub well_known_name: Option<String>,
    #[serde(rename = "parentFolderId", default)]
    pub parent_folder_id: Option<String>,
    #[serde(rename = "totalItemCount", default)]
    pub total_item_count: Option<i64>,
    #[serde(rename = "unreadItemCount", default)]
    pub unread_item_count: Option<i64>,
}

/// Response wrapper for `GET /me/mailFolders`.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MailFolderListResponse {
    #[serde(default)]
    pub value: Vec<MailFolder>,
    #[serde(rename = "@odata.nextLink", default)]
    pub next_link: Option<String>,
}

// -- Attachments --

/// A Microsoft Graph `fileAttachment` (the `@odata.type` we support). Other
/// attachment kinds (item/reference) are ignored by the client.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileAttachment {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "contentType", default)]
    pub content_type: Option<String>,
    #[serde(default)]
    pub size: i64,
    #[serde(rename = "isInline", default)]
    pub is_inline: bool,
    #[serde(rename = "contentId", default)]
    pub content_id: Option<String>,
    /// Base64-encoded attachment bytes (standard base64, not URL-safe).
    #[serde(rename = "contentBytes", default)]
    pub content_bytes: Option<String>,
}

/// Response wrapper for `GET /me/messages/{id}/attachments`.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AttachmentListResponse {
    #[serde(default)]
    pub value: Vec<FileAttachment>,
}

// -- Profile --

/// Subset of the Graph `user` resource returned by `GET /me`.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UserResource {
    pub id: String,
    /// Primary SMTP address. May be null for accounts without a mailbox.
    #[serde(default)]
    pub mail: Option<String>,
    #[serde(rename = "userPrincipalName", default)]
    pub user_principal_name: Option<String>,
    #[serde(rename = "displayName", default)]
    pub display_name: Option<String>,
}

// -- Sending --

/// Request body for `POST /me/sendMail`.
#[derive(Serialize, Debug, Clone)]
pub struct SendMailRequest {
    pub message: OutgoingMessage,
    #[serde(rename = "saveToSentItems")]
    pub save_to_sent_items: bool,
}

/// The message object embedded in a [`SendMailRequest`] or used to create a draft.
#[derive(Serialize, Debug, Clone, Default)]
pub struct OutgoingMessage {
    pub subject: String,
    pub body: ItemBody,
    #[serde(rename = "toRecipients")]
    pub to_recipients: Vec<Recipient>,
    #[serde(rename = "ccRecipients", skip_serializing_if = "Vec::is_empty")]
    pub cc_recipients: Vec<Recipient>,
    #[serde(rename = "bccRecipients", skip_serializing_if = "Vec::is_empty")]
    pub bcc_recipients: Vec<Recipient>,
    #[serde(rename = "attachments", skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<OutgoingAttachment>,
    /// Custom internet message headers (e.g. `In-Reply-To`, `References`). Header
    /// names sent via Graph must be prefixed with `x-` unless they are standard.
    #[serde(rename = "internetMessageHeaders", skip_serializing_if = "Vec::is_empty")]
    pub internet_message_headers: Vec<InternetMessageHeader>,
}

/// A `#microsoft.graph.fileAttachment` to send with an [`OutgoingMessage`].
#[derive(Serialize, Debug, Clone)]
pub struct OutgoingAttachment {
    #[serde(rename = "@odata.type")]
    pub odata_type: String,
    pub name: String,
    #[serde(rename = "contentType")]
    pub content_type: String,
    /// Base64-encoded bytes (standard base64).
    #[serde(rename = "contentBytes")]
    pub content_bytes: String,
}

impl OutgoingAttachment {
    /// Build a file attachment from raw bytes, base64-encoding the content.
    pub fn file(name: String, content_type: String, content_bytes: String) -> Self {
        Self {
            odata_type: "#microsoft.graph.fileAttachment".to_string(),
            name,
            content_type,
            content_bytes,
        }
    }
}

/// Helpers for mapping Outlook well-known folders onto the provider-agnostic
/// system labels in [`crate::email::service::label::system_labels`].
pub mod well_known_folder {
    use crate::email::service::label::system_labels;

    /// Map a Graph `wellKnownName` (e.g. `"inbox"`, `"sentitems"`) onto a
    /// provider-agnostic system label id, if one exists.
    ///
    /// Returns `None` for user-created folders and for well-known folders that
    /// have no system-label analogue (e.g. `"archive"`, `"outbox"`).
    pub fn to_system_label(well_known_name: &str) -> Option<&'static str> {
        match well_known_name.to_ascii_lowercase().as_str() {
            "inbox" => Some(system_labels::INBOX),
            "sentitems" => Some(system_labels::SENT),
            "drafts" => Some(system_labels::DRAFT),
            "junkemail" => Some(system_labels::SPAM),
            "deleteditems" => Some(system_labels::TRASH),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email::service::label::system_labels;

    #[test]
    fn deserializes_graph_message() {
        let json = r#"{
            "id": "AAMkAGI2",
            "changeKey": "CQAAABYA",
            "conversationId": "AAQkAGI2",
            "internetMessageId": "<abc@contoso.com>",
            "subject": "Hello",
            "bodyPreview": "preview text",
            "body": { "contentType": "html", "content": "<p>hi</p>" },
            "from": { "emailAddress": { "name": "Alice", "address": "alice@contoso.com" } },
            "toRecipients": [ { "emailAddress": { "name": "Bob", "address": "bob@contoso.com" } } ],
            "receivedDateTime": "2026-06-01T12:00:00Z",
            "sentDateTime": "2026-06-01T11:59:00Z",
            "isRead": false,
            "isDraft": false,
            "hasAttachments": true,
            "parentFolderId": "inboxfolderid",
            "categories": ["Work"],
            "flag": { "flagStatus": "flagged" }
        }"#;

        let msg: MessageResource = serde_json::from_str(json).unwrap();
        assert_eq!(msg.id, "AAMkAGI2");
        assert_eq!(msg.conversation_id.as_deref(), Some("AAQkAGI2"));
        assert_eq!(msg.internet_message_id.as_deref(), Some("<abc@contoso.com>"));
        assert!(!msg.is_read);
        assert!(msg.has_attachments);
        assert_eq!(msg.from.unwrap().email_address.address.as_deref(), Some("alice@contoso.com"));
        assert_eq!(msg.to_recipients.len(), 1);
        assert_eq!(msg.categories, vec!["Work".to_string()]);
        assert_eq!(msg.flag.unwrap().flag_status.as_deref(), Some("flagged"));
    }

    #[test]
    fn deserializes_message_list_with_next_link() {
        let json = r#"{
            "value": [ { "id": "1" }, { "id": "2" } ],
            "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=2"
        }"#;
        let list: MessageListResponse = serde_json::from_str(json).unwrap();
        assert_eq!(list.value.len(), 2);
        assert!(list.next_link.is_some());
    }

    #[test]
    fn maps_well_known_folders_to_system_labels() {
        assert_eq!(well_known_folder::to_system_label("inbox"), Some(system_labels::INBOX));
        assert_eq!(well_known_folder::to_system_label("SentItems"), Some(system_labels::SENT));
        assert_eq!(well_known_folder::to_system_label("drafts"), Some(system_labels::DRAFT));
        assert_eq!(well_known_folder::to_system_label("junkemail"), Some(system_labels::SPAM));
        assert_eq!(well_known_folder::to_system_label("deleteditems"), Some(system_labels::TRASH));
        assert_eq!(well_known_folder::to_system_label("archive"), None);
        assert_eq!(well_known_folder::to_system_label("MyCustomFolder"), None);
    }
}
