//! Pure mappers from Microsoft Graph resources to the provider-agnostic
//! service-layer structs in `models_email::email::service`.
//!
//! This is the Outlook analogue of `email_service::convert`. Because Graph
//! returns already-structured JSON (rather than a raw MIME payload like Gmail),
//! the mapping is straightforward and has no I/O, which makes it easy to unit
//! test in isolation.

use chrono::{DateTime, Utc};
use macro_uuid::generate_uuid_v7;
use models_email::email::service;
use models_email::email::service::label::system_labels;
use models_email::outlook::{MessageResource, Recipient};
use uuid::Uuid;

/// Map a Graph [`Recipient`] to a service [`ContactInfo`](service::address::ContactInfo).
///
/// Recipients with no address are dropped by the plural helper; this returns
/// `None` in that case so callers can filter.
fn recipient_to_contact(recipient: &Recipient) -> Option<service::address::ContactInfo> {
    let email = recipient.email_address.address.as_ref()?;
    if email.is_empty() {
        return None;
    }
    Some(service::address::ContactInfo {
        email: email.to_lowercase(),
        name: recipient.email_address.name.clone(),
        photo_url: None,
    })
}

fn recipients_to_contacts(recipients: &[Recipient]) -> Vec<service::address::ContactInfo> {
    recipients.iter().filter_map(recipient_to_contact).collect()
}

/// Parse an ISO-8601 / RFC-3339 timestamp as returned by Graph
/// (e.g. `"2026-06-01T12:00:00Z"`).
fn parse_graph_datetime(value: &Option<String>) -> Option<DateTime<Utc>> {
    let s = value.as_ref()?;
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

/// Build the provider-agnostic label set for a message.
///
/// Outlook has no per-message label list like Gmail. We synthesize one from:
///  - read state (`UNREAD` when the message is unread),
///  - the follow-up flag (`STARRED` when flagged),
///  - draft state (`DRAFT`),
///  - the system label for the message's parent folder, if the caller resolved
///    one (e.g. `INBOX`, `SENT`, `SPAM`, `TRASH`),
///  - each user `category` as a user label (its name doubles as its id).
fn build_labels(
    message: &MessageResource,
    link_id: Uuid,
    folder_system_label: Option<&str>,
) -> Vec<service::label::Label> {
    let mut provider_label_ids: Vec<String> = Vec::new();

    if !message.is_read {
        provider_label_ids.push(system_labels::UNREAD.to_string());
    }
    if message
        .flag
        .as_ref()
        .and_then(|f| f.flag_status.as_deref())
        .is_some_and(|s| s.eq_ignore_ascii_case("flagged"))
    {
        provider_label_ids.push(system_labels::STARRED.to_string());
    }
    if message.is_draft {
        provider_label_ids.push(system_labels::DRAFT.to_string());
    }
    if let Some(system_label) = folder_system_label {
        provider_label_ids.push(system_label.to_string());
    }
    for category in &message.categories {
        provider_label_ids.push(category.clone());
    }

    provider_label_ids
        .into_iter()
        .map(|id| service::label::Label {
            id: None,
            link_id,
            provider_label_id: id,
            name: None,
            created_at: Default::default(),
            message_list_visibility: None,
            label_list_visibility: None,
            type_: None,
        })
        .collect()
}

/// Map a Graph [`MessageResource`] to a service-layer [`Message`](service::message::Message).
///
/// `folder_system_label` is the system label the caller resolved for the
/// message's `parentFolderId` (via a folder lookup), if any. Attachment bytes
/// are fetched separately, so only `has_attachments` is populated here.
#[tracing::instrument(skip(message), fields(message_id = %message.id), level = "debug")]
pub fn map_message_resource_to_service(
    message: MessageResource,
    link_id: Uuid,
    folder_system_label: Option<&str>,
) -> service::message::Message {
    let internal_date_ts = parse_graph_datetime(&message.received_date_time);
    let sent_at = parse_graph_datetime(&message.sent_date_time).or(internal_date_ts);

    let is_sent = folder_system_label == Some(system_labels::SENT);
    let labels = build_labels(&message, link_id, folder_system_label);

    let (body_text, body_html_sanitized) = match &message.body {
        Some(body) if body.content_type.eq_ignore_ascii_case("html") => {
            (None, Some(body.content.clone()))
        }
        Some(body) => (Some(body.content.clone()), None),
        None => (None, None),
    };

    let headers_json = if message.internet_message_headers.is_empty() {
        None
    } else {
        serde_json::to_value(
            message
                .internet_message_headers
                .iter()
                .map(|h| serde_json::json!({ "name": h.name, "value": h.value }))
                .collect::<Vec<_>>(),
        )
        .ok()
    };

    let from = message.from.as_ref().and_then(recipient_to_contact);

    service::message::Message {
        db_id: generate_uuid_v7(),
        provider_id: Some(message.id),
        thread_db_id: generate_uuid_v7(),
        provider_thread_id: message.conversation_id,
        replying_to_id: None,
        global_id: message.internet_message_id,
        link_id,
        subject: message.subject,
        snippet: message.body_preview,
        // Outlook has no monotonic per-message history id; delta links live on
        // the link, not the message.
        provider_history_id: None,
        internal_date_ts,
        sent_at,
        size_estimate: message.size,
        is_read: message.is_read,
        is_starred: message
            .flag
            .as_ref()
            .and_then(|f| f.flag_status.as_deref())
            .is_some_and(|s| s.eq_ignore_ascii_case("flagged")),
        is_sent,
        is_draft: message.is_draft,
        scheduled_send_time: None,
        has_attachments: message.has_attachments,
        from,
        to: recipients_to_contacts(&message.to_recipients),
        cc: recipients_to_contacts(&message.cc_recipients),
        bcc: recipients_to_contacts(&message.bcc_recipients),
        labels,
        body_text,
        body_html_sanitized,
        body_macro: None,
        attachments: Vec::new(),
        attachments_draft: Vec::new(),
        attachments_forwarded: Vec::new(),
        headers_json,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use models_email::outlook::{EmailAddress, FollowupFlag, ItemBody};

    fn sample_message() -> MessageResource {
        MessageResource {
            id: "msg-1".to_string(),
            change_key: Some("ck".to_string()),
            conversation_id: Some("conv-1".to_string()),
            internet_message_id: Some("<abc@contoso.com>".to_string()),
            subject: Some("Hello".to_string()),
            body_preview: Some("preview".to_string()),
            body: Some(ItemBody {
                content_type: "html".to_string(),
                content: "<p>hi</p>".to_string(),
            }),
            from: Some(Recipient {
                email_address: EmailAddress {
                    name: Some("Alice".to_string()),
                    address: Some("Alice@Contoso.com".to_string()),
                },
            }),
            to_recipients: vec![Recipient {
                email_address: EmailAddress {
                    name: Some("Bob".to_string()),
                    address: Some("bob@contoso.com".to_string()),
                },
            }],
            cc_recipients: vec![],
            bcc_recipients: vec![],
            reply_to: vec![],
            received_date_time: Some("2026-06-01T12:00:00Z".to_string()),
            sent_date_time: Some("2026-06-01T11:59:00Z".to_string()),
            is_read: false,
            is_draft: false,
            has_attachments: true,
            size: Some(2048),
            parent_folder_id: Some("inbox-folder".to_string()),
            categories: vec!["Work".to_string()],
            flag: Some(FollowupFlag {
                flag_status: Some("flagged".to_string()),
            }),
            internet_message_headers: vec![],
        }
    }

    #[test]
    fn maps_core_fields() {
        let msg = map_message_resource_to_service(
            sample_message(),
            Uuid::nil(),
            Some(system_labels::INBOX),
        );

        assert_eq!(msg.provider_id.as_deref(), Some("msg-1"));
        assert_eq!(msg.provider_thread_id.as_deref(), Some("conv-1"));
        assert_eq!(msg.global_id.as_deref(), Some("<abc@contoso.com>"));
        assert_eq!(msg.subject.as_deref(), Some("Hello"));
        assert_eq!(msg.snippet.as_deref(), Some("preview"));
        assert_eq!(msg.size_estimate, Some(2048));
        assert!(msg.has_attachments);
        assert!(!msg.is_read);
        assert!(msg.is_starred);
        assert!(!msg.is_sent);
    }

    #[test]
    fn lowercases_addresses_and_keeps_names() {
        let msg = map_message_resource_to_service(sample_message(), Uuid::nil(), None);
        let from = msg.from.unwrap();
        assert_eq!(from.email, "alice@contoso.com");
        assert_eq!(from.name.as_deref(), Some("Alice"));
        assert_eq!(msg.to.len(), 1);
        assert_eq!(msg.to[0].email, "bob@contoso.com");
    }

    #[test]
    fn html_body_goes_to_sanitized_text_body_empty() {
        let msg = map_message_resource_to_service(sample_message(), Uuid::nil(), None);
        assert_eq!(msg.body_html_sanitized.as_deref(), Some("<p>hi</p>"));
        assert!(msg.body_text.is_none());
    }

    #[test]
    fn text_body_goes_to_body_text() {
        let mut raw = sample_message();
        raw.body = Some(ItemBody {
            content_type: "text".to_string(),
            content: "plain text".to_string(),
        });
        let msg = map_message_resource_to_service(raw, Uuid::nil(), None);
        assert_eq!(msg.body_text.as_deref(), Some("plain text"));
        assert!(msg.body_html_sanitized.is_none());
    }

    #[test]
    fn synthesizes_labels_from_flags_folder_and_categories() {
        let msg = map_message_resource_to_service(
            sample_message(),
            Uuid::nil(),
            Some(system_labels::INBOX),
        );
        let ids: Vec<&str> = msg
            .labels
            .iter()
            .map(|l| l.provider_label_id.as_str())
            .collect();
        assert!(ids.contains(&system_labels::UNREAD));
        assert!(ids.contains(&system_labels::STARRED));
        assert!(ids.contains(&system_labels::INBOX));
        assert!(ids.contains(&"Work"));
        assert!(!ids.contains(&system_labels::DRAFT));
    }

    #[test]
    fn sent_folder_marks_message_sent() {
        let msg = map_message_resource_to_service(
            sample_message(),
            Uuid::nil(),
            Some(system_labels::SENT),
        );
        assert!(msg.is_sent);
    }

    #[test]
    fn parses_timestamps() {
        let msg = map_message_resource_to_service(sample_message(), Uuid::nil(), None);
        assert_eq!(
            msg.internal_date_ts.unwrap().to_rfc3339(),
            "2026-06-01T12:00:00+00:00"
        );
        assert_eq!(
            msg.sent_at.unwrap().to_rfc3339(),
            "2026-06-01T11:59:00+00:00"
        );
    }
}
