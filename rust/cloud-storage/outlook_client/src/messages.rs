//! Message fetch and send operations against Microsoft Graph.

use crate::OutlookClient;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use models_email::email::service::address::ContactInfo;
use models_email::email::service::message::MessageToSend;
use models_email::outlook::error::OutlookError;
use models_email::outlook::{
    EmailAddress, ItemBody, MessageResource, OutgoingAttachment, OutgoingMessage, Recipient,
};

/// Fetch a single message by id. Returns `None` if it no longer exists.
pub(crate) async fn get_message(
    client: &OutlookClient,
    access_token: &str,
    message_id: &str,
) -> Result<Option<MessageResource>, OutlookError> {
    // `$select` the fields our convert layer needs; request internet headers so
    // we can persist them (and recover Reply-To etc.) like we do for Gmail.
    let url = format!(
        "{}/me/messages/{}?$select={}",
        client.base_url,
        message_id,
        MESSAGE_SELECT
    );
    client.graph_get_opt(access_token, &url).await
}

/// The set of message fields we project. Keep in sync with what
/// [`crate::convert::map_message_resource_to_service`] reads.
pub(crate) const MESSAGE_SELECT: &str = "id,changeKey,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,replyTo,receivedDateTime,sentDateTime,isRead,isDraft,hasAttachments,parentFolderId,categories,flag,internetMessageHeaders";

fn contact_to_recipient(contact: &ContactInfo) -> Recipient {
    Recipient {
        email_address: EmailAddress {
            name: contact.name.clone(),
            address: Some(contact.email.clone()),
        },
    }
}

fn contacts_to_recipients(contacts: &Option<Vec<ContactInfo>>) -> Vec<Recipient> {
    contacts
        .as_ref()
        .map(|cs| cs.iter().map(contact_to_recipient).collect())
        .unwrap_or_default()
}

/// Build the Graph message body to send from a [`MessageToSend`]. HTML is
/// preferred when present (matching how the composer produces content).
fn build_outgoing_message(message: &MessageToSend) -> OutgoingMessage {
    let body = if let Some(html) = &message.body_html {
        ItemBody {
            content_type: "html".to_string(),
            content: html.clone(),
        }
    } else {
        ItemBody {
            content_type: "text".to_string(),
            content: message.body_text.clone().unwrap_or_default(),
        }
    };

    let attachments = message
        .attachments
        .as_ref()
        .map(|atts| {
            atts.iter()
                .map(|att| {
                    OutgoingAttachment::file(
                        att.file_name.clone(),
                        att.content_type.clone(),
                        STANDARD.encode(&att.data),
                    )
                })
                .collect()
        })
        .unwrap_or_default();

    OutgoingMessage {
        subject: message.subject.clone(),
        body,
        to_recipients: contacts_to_recipients(&message.to),
        cc_recipients: contacts_to_recipients(&message.cc),
        bcc_recipients: contacts_to_recipients(&message.bcc),
        attachments,
        internet_message_headers: Vec::new(),
    }
}

/// Send a message.
///
/// Unlike Gmail's `messages.send` (which returns the created id + thread id),
/// Graph's `sendMail` returns nothing. To still capture the provider ids — and
/// to thread replies correctly — we create a draft first, then send it:
///
/// * **reply** (`parent_provider_message_id` set): `createReply` produces a draft
///   already attached to the conversation; we patch it with the composed
///   content and recipients, then send.
/// * **new message**: create a fresh draft, then send.
///
/// On success `message.provider_id` / `message.provider_thread_id` are set from
/// the draft. Note Graph may re-id the message when it lands in Sent Items; the
/// subsequent delta sync reconciles the canonical copy.
pub(crate) async fn send_message(
    client: &OutlookClient,
    access_token: &str,
    message: &mut MessageToSend,
    from_contact: &ContactInfo,
    parent_provider_message_id: Option<String>,
) -> Result<(), OutlookError> {
    let _ = from_contact; // Graph derives From from the authenticated mailbox.
    let outgoing = build_outgoing_message(message);

    let draft = if let Some(parent_id) = parent_provider_message_id {
        // Create a reply draft attached to the existing conversation.
        let create_reply_url = format!("{}/me/messages/{}/createReply", client.base_url, parent_id);
        let draft: MessageResource = {
            let resp = client
                .inner
                .post(&create_reply_url)
                .bearer_auth(access_token)
                .header("Content-Length", "0")
                .send()
                .await
                .map_err(|e| OutlookError::HttpRequest(e.to_string()))?;
            OutlookClient::deserialize_success(resp).await?
        };

        // Overwrite the auto-generated reply with the composed content.
        let patch_url = format!("{}/me/messages/{}", client.base_url, draft.id);
        let resp = client
            .inner
            .patch(&patch_url)
            .bearer_auth(access_token)
            .json(&outgoing)
            .send()
            .await
            .map_err(|e| OutlookError::HttpRequest(e.to_string()))?;
        OutlookClient::deserialize_success::<MessageResource>(resp).await?
    } else {
        // Create a standalone draft.
        let create_url = format!("{}/me/messages", client.base_url);
        let resp = client
            .inner
            .post(&create_url)
            .bearer_auth(access_token)
            .json(&outgoing)
            .send()
            .await
            .map_err(|e| OutlookError::HttpRequest(e.to_string()))?;
        OutlookClient::deserialize_success::<MessageResource>(resp).await?
    };

    // Send the draft.
    let send_url = format!("{}/me/messages/{}/send", client.base_url, draft.id);
    let resp = client
        .inner
        .post(&send_url)
        .bearer_auth(access_token)
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| OutlookError::HttpRequest(e.to_string()))?;
    OutlookClient::ensure_success(resp).await?;

    message.provider_id = Some(draft.id);
    if let Some(conversation_id) = draft.conversation_id {
        message.provider_thread_id = Some(conversation_id);
    }

    Ok(())
}
