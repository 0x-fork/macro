//! Attachment download from Microsoft Graph.

use crate::OutlookClient;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use models_email::outlook::error::OutlookError;
use models_email::outlook::FileAttachment;

/// Download and decode the bytes of a single file attachment.
///
/// Graph returns file-attachment content as standard (not URL-safe) base64 in
/// the `contentBytes` field.
pub(crate) async fn get_attachment_data(
    client: &OutlookClient,
    access_token: &str,
    message_id: &str,
    attachment_id: &str,
) -> Result<Vec<u8>, OutlookError> {
    let url = format!(
        "{}/me/messages/{}/attachments/{}",
        client.base_url, message_id, attachment_id
    );

    let attachment: FileAttachment = client.graph_get(access_token, &url).await?;

    let content = attachment.content_bytes.ok_or_else(|| {
        OutlookError::BodyReadError("attachment response missing contentBytes".to_string())
    })?;

    STANDARD
        .decode(content)
        .map_err(|e| OutlookError::BodyReadError(format!("failed to decode attachment base64: {e}")))
}
