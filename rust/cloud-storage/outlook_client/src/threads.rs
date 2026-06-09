//! Conversation (thread) operations against Microsoft Graph.
//!
//! Outlook groups related messages by `conversationId`. There is no first-class
//! "thread" resource as in Gmail, so we reconstruct a thread by listing all
//! messages that share a conversation id.

use crate::OutlookClient;
use crate::messages::MESSAGE_SELECT;
use models_email::outlook::error::OutlookError;
use models_email::outlook::{MessageListResponse, MessageResource};

/// Maximum messages per page (Graph caps `$top` at 1000 for messages).
const PAGE_SIZE: u32 = 100;

/// Fetch every message in a conversation, oldest first, following pagination.
pub(crate) async fn get_conversation_messages(
    client: &OutlookClient,
    access_token: &str,
    conversation_id: &str,
) -> Result<Vec<MessageResource>, OutlookError> {
    // Single-quotes inside an OData string literal are escaped by doubling them.
    let escaped = conversation_id.replace('\'', "''");
    let mut next_url = Some(format!(
        "{}/me/messages?$filter=conversationId eq '{}'&$orderby=receivedDateTime asc&$top={}&$select={}",
        client.base_url, escaped, PAGE_SIZE, MESSAGE_SELECT
    ));

    let mut messages = Vec::new();
    while let Some(url) = next_url.take() {
        let page: MessageListResponse = client.graph_get(access_token, &url).await?;
        messages.extend(page.value);
        next_url = page.next_link;
    }

    Ok(messages)
}
