//! Profile lookup against Microsoft Graph (`GET /me`).

use crate::OutlookClient;
use models_email::outlook::UserResource;
use models_email::outlook::error::OutlookError;

/// Fetch the signed-in user's profile. Used to resolve the primary SMTP address
/// of a freshly-linked Outlook inbox (the analogue of Gmail's
/// `users.getProfile`).
pub(crate) async fn get_profile(
    client: &OutlookClient,
    access_token: &str,
) -> Result<UserResource, OutlookError> {
    let url = format!(
        "{}/me?$select=id,mail,userPrincipalName,displayName",
        client.base_url
    );
    client.graph_get(access_token, &url).await
}
