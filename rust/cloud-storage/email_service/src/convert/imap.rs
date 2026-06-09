//! Maps raw RFC 5322 messages fetched over IMAP to service layer models.
//!
//! The Gmail path gets a structured `MessageResource` from the API; IMAP only
//! hands us the raw message bytes plus folder/flag context, so this module
//! parses the MIME structure with `mailparse` and synthesizes the
//! Gmail-compatible system labels (`INBOX`, `SENT`, `UNREAD`, ...) the rest of
//! the email stack keys off.

use crate::convert::message::parse_address_header;
use crate::convert::sanitizer::sanitize_email_html;
use anyhow::{Context, Result};
use chrono::{TimeZone, Utc};
use imap_smtp_client::FetchedMessage;
use macro_uuid::generate_uuid_v7;
use mailparse::{MailHeaderMap, ParsedMail};
use models_email::email::service;
use models_email::gmail::Header;
use models_email::gmail::labels::SystemLabelID;
use uuid::Uuid;

#[cfg(test)]
mod test;

const SNIPPET_MAX_CHARS: usize = 200;

/// A message mapped from IMAP, along with the threading hints needed to
/// attach it to an existing conversation.
#[derive(Debug)]
pub struct MappedImapMessage {
    /// The mapped service message. `provider_id` is the message's RFC 5322
    /// `Message-ID` (bracketed), which doubles as its `global_id`;
    /// `provider_thread_id` is left unset for the caller to fill in after
    /// thread resolution.
    pub message: service::message::Message,
    /// Message-IDs (bracketed) of ancestors, from `References` and
    /// `In-Reply-To`, used to find the thread this message belongs to.
    pub ancestor_global_ids: Vec<String>,
}

/// Maps a raw message fetched from an IMAP folder to the service model.
///
/// `is_sent_folder` marks messages from the sent mailbox so they get the
/// `SENT` label instead of `INBOX`.
#[tracing::instrument(skip(fetched), err)]
pub fn map_imap_message_to_service(
    fetched: &FetchedMessage,
    link_id: Uuid,
    folder: &str,
    uid_validity: u32,
    is_sent_folder: bool,
) -> Result<MappedImapMessage> {
    let parsed = mailparse::parse_mail(&fetched.body).context("failed to parse RFC 5322 body")?;

    let all_headers: Vec<Header> = parsed
        .headers
        .iter()
        .map(|h| Header {
            name: h.get_key(),
            value: h.get_value(),
        })
        .collect();

    let find_header = |name: &str| -> Option<&str> {
        all_headers
            .iter()
            .find(|h| h.name.eq_ignore_ascii_case(name))
            .map(|h| h.value.as_str())
    };

    // Some messages (rarely) lack a Message-ID; synthesize a stable one from
    // the folder coordinates so dedupe still works across polls.
    let global_id = find_header("Message-ID")
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| format!("<imap-{link_id}-{folder}-{uid_validity}-{}>", fetched.uid));

    let ancestor_global_ids = parse_ancestor_ids(
        find_header("References"),
        find_header("In-Reply-To"),
        &global_id,
    );

    let subject = find_header("Subject").map(str::to_string);

    let sent_at = find_header("Date")
        .and_then(|d| mailparse::dateparse(d).ok())
        .and_then(|ts| Utc.timestamp_opt(ts, 0).single());
    let internal_date_ts = fetched.internal_date.or(sent_at);

    let from = find_header("From")
        .and_then(|v| parse_address_header(v).into_iter().next())
        .map(|(name, email)| service::address::ContactInfo {
            email,
            name,
            photo_url: None,
        });

    let parse_contacts = |name: &str| -> Vec<service::address::ContactInfo> {
        find_header(name)
            .map(|v| {
                parse_address_header(v)
                    .into_iter()
                    .map(|(name, email)| service::address::ContactInfo {
                        email,
                        name,
                        photo_url: None,
                    })
                    .collect()
            })
            .unwrap_or_default()
    };

    let bodies = extract_bodies(&parsed);

    let mut provider_label_ids = vec![if is_sent_folder {
        SystemLabelID::Sent.as_str().to_string()
    } else {
        SystemLabelID::Inbox.as_str().to_string()
    }];
    if !fetched.seen {
        provider_label_ids.push(SystemLabelID::Unread.as_str().to_string());
    }
    if fetched.flagged {
        provider_label_ids.push(SystemLabelID::Starred.as_str().to_string());
    }
    if fetched.draft {
        provider_label_ids.push(SystemLabelID::Draft.as_str().to_string());
    }

    let labels = provider_label_ids
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
        .collect();

    let snippet = bodies.text.as_deref().map(make_snippet).unwrap_or_default();

    let message = service::message::Message {
        db_id: generate_uuid_v7(),
        provider_id: Some(global_id.clone()),
        thread_db_id: generate_uuid_v7(),
        // Filled in by the caller once the thread is resolved.
        provider_thread_id: None,
        replying_to_id: None, // gets generated later, once message has been inserted
        global_id: Some(global_id),
        link_id,
        subject,
        snippet: Some(snippet),
        provider_history_id: None,
        internal_date_ts,
        sent_at: sent_at.or(internal_date_ts),
        size_estimate: Some(fetched.body.len() as i64),
        is_read: fetched.seen,
        is_starred: fetched.flagged,
        is_sent: is_sent_folder,
        is_draft: fetched.draft,
        scheduled_send_time: None,
        has_attachments: !bodies.attachments.is_empty(),
        from,
        to: parse_contacts("To"),
        cc: parse_contacts("Cc"),
        bcc: parse_contacts("Bcc"),
        labels,
        body_text: bodies.text,
        body_html_sanitized: bodies.html_sanitized,
        body_macro: None,
        attachments: bodies.attachments,
        attachments_draft: Vec::new(),
        attachments_forwarded: Vec::new(),
        headers_json: Some(serde_json::to_value(all_headers)?),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    Ok(MappedImapMessage {
        message,
        ancestor_global_ids,
    })
}

/// Collects bracketed ancestor Message-IDs from `References` and
/// `In-Reply-To`, oldest first, excluding the message's own id.
fn parse_ancestor_ids(
    references: Option<&str>,
    in_reply_to: Option<&str>,
    own_global_id: &str,
) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for source in [references, in_reply_to].into_iter().flatten() {
        for token in source.split_whitespace() {
            let token = token.trim();
            if token.starts_with('<') && token.ends_with('>') && token != own_global_id {
                if !ids.iter().any(|existing| existing == token) {
                    ids.push(token.to_string());
                }
            }
        }
    }
    ids
}

#[derive(Default)]
struct ExtractedBodies {
    text: Option<String>,
    html_sanitized: Option<String>,
    attachments: Vec<service::attachment::Attachment>,
}

/// Walks the MIME tree collecting the first text/plain and text/html bodies
/// plus attachment metadata, mirroring `parse_gmail_payload`'s traversal.
fn extract_bodies(root: &ParsedMail) -> ExtractedBodies {
    let mut out = ExtractedBodies::default();
    let mut stack: Vec<&ParsedMail> = vec![root];

    while let Some(part) = stack.pop() {
        let mime_type = part.ctype.mimetype.to_lowercase();
        let is_multipart = mime_type.starts_with("multipart/");

        let disposition = part.get_content_disposition();
        let is_attachment_disposition =
            disposition.disposition == mailparse::DispositionType::Attachment;
        let filename = disposition.params.get("filename").cloned();

        let is_inline_non_text = disposition.disposition == mailparse::DispositionType::Inline
            && !mime_type.starts_with("text/")
            && !is_multipart;
        let is_regular_attachment = is_attachment_disposition
            || (filename.is_some() && !is_multipart && !mime_type.starts_with("text/"));

        if !is_multipart {
            if is_inline_non_text || is_regular_attachment {
                let size_bytes = part.get_body_raw().map(|b| b.len() as i64).ok();
                let content_id = part.headers.get_first_value("Content-ID");

                out.attachments.push(service::attachment::Attachment {
                    db_id: generate_uuid_v7(),
                    // IMAP has no per-attachment provider id; downloads
                    // re-fetch the message by Message-ID instead.
                    provider_id: None,
                    data_url: None,
                    filename: filename.map(lowercase_extension),
                    mime_type: Some(part.ctype.mimetype.clone()),
                    size_bytes,
                    content_id,
                    sfs_id: None,
                });
            } else if mime_type == "text/plain" && out.text.is_none() {
                if let Ok(body) = part.get_body() {
                    out.text = Some(body);
                }
            } else if mime_type == "text/html" && out.html_sanitized.is_none() {
                if let Ok(body) = part.get_body() {
                    out.html_sanitized = Some(sanitize_email_html(&body));
                }
            }
        }

        for sub_part in part.subparts.iter().rev() {
            stack.push(sub_part);
        }
    }

    out
}

fn lowercase_extension(filename: String) -> String {
    if let Some((base, ext)) = filename.rsplit_once('.')
        && !ext.is_empty()
    {
        return format!("{}.{}", base, ext.to_lowercase());
    }
    filename
}

fn make_snippet(text: &str) -> String {
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(SNIPPET_MAX_CHARS).collect()
}
