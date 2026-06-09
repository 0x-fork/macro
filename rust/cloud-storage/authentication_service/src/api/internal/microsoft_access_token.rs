use axum::{
    Json,
    extract::{self, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use fusionauth::FusionAuthClient;
use fusionauth::error::FusionAuthClientError;
use macro_middleware::auth::internal_access::ValidInternalKey;
use model::authentication::microsoft_token::MicrosoftAccessToken;
use model::response::ErrorResponse;
use std::sync::Arc;

/// FusionAuth identity-provider name for the Microsoft (Outlook) IdP. Mirrors
/// the `google_gmail` name used for Gmail.
pub(crate) const OUTLOOK_IDENTITY_PROVIDER_NAME: &str = "microsoft_outlook";

#[derive(serde::Deserialize, Debug)]
pub struct MicrosoftAccessTokenParams {
    fusionauth_user_id: String,
    /// The linked Microsoft account's email — what FusionAuth stores as
    /// `display_name` on the IdP link. Discriminates one Microsoft account from
    /// another when the FA user has multiple Microsoft IdP links.
    email: String,
}

/// Gets a Microsoft (Outlook) access token for the linked account. Mirrors the
/// Gmail `google_access_token` handler.
#[tracing::instrument(skip(auth_client, _internal_access))]
pub async fn handler(
    State(auth_client): State<Arc<FusionAuthClient>>,
    _internal_access: ValidInternalKey,
    extract::Query(params): extract::Query<MicrosoftAccessTokenParams>,
) -> Result<Response, Response> {
    get_access_token(auth_client, &params, OUTLOOK_IDENTITY_PROVIDER_NAME).await
}

/// Fetches an access token for a user from the Microsoft identity provider by
/// looking up their IdP link and refreshing the stored refresh token.
#[tracing::instrument(skip(auth_client))]
async fn get_access_token(
    auth_client: Arc<FusionAuthClient>,
    params: &MicrosoftAccessTokenParams,
    identity_provider_name: &str,
) -> Result<Response, Response> {
    let fusionauth_user_id = params.fusionauth_user_id.as_str();
    let email = params.email.as_str();

    // get identity provider id
    let idp_id = auth_client
        .get_identity_provider_id_by_name(identity_provider_name)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "unable to find idp id for {}", identity_provider_name);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "unable to find idp".into(),
                }),
            )
                .into_response()
        })?;

    // get refresh token via link
    let links = auth_client
        .get_links(fusionauth_user_id, Some(idp_id.clone()))
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "error fetching links for userid {} and idp id {}", fusionauth_user_id, idp_id.as_str());
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "unable to fetch links".into(),
                }),
            )
                .into_response()
        })?;

    // a fusionauth user can have multiple links to the same identity provider with different email
    // addresses, but can only have one link with a given email
    let link = links
        .into_iter()
        .find(|l| l.display_name.as_str() == email)
        .ok_or_else(|| {
            tracing::error!(
                "link not found for user id {} and idp id {}",
                fusionauth_user_id,
                idp_id.as_str()
            );
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    message: format!("No {} link found for this user", identity_provider_name)
                        .into(),
                }),
            )
                .into_response()
        })?;

    // get access token using refresh token
    let token_response = auth_client
        .refresh_microsoft_token(link.token.as_str())
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "error fetching microsoft access token for userid {}", fusionauth_user_id);
            let status_code = match &e {
                FusionAuthClientError::InvalidGrant => StatusCode::FORBIDDEN,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            };
            let message = format!("unable to fetch {} access token", identity_provider_name);
            (status_code, Json(ErrorResponse { message: message.into() })).into_response()
        })?;

    Ok((
        StatusCode::OK,
        Json(MicrosoftAccessToken {
            access_token: token_response.access_token,
        }),
    )
        .into_response())
}
