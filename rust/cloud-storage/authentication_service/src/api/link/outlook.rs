use anyhow::Context;
use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use macro_middleware::tracking::ClientIp;
use model::response::ErrorResponse;
use model_user::axum_extractor::MacroUserExtractor;
use serde_utils::urlencode::UrlEncoded;
use url::Url;

use crate::api::{
    context::ApiContext, link::github::REAUTHENTICATION_REQUIRED_MESSAGE, oauth2::OAuthState,
};

/// Microsoft identity platform v2.0 authorize endpoint. `common` supports both
/// work/school (Entra) and personal Microsoft accounts.
const MICROSOFT_AUTHORIZATION_URL: &str =
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
/// FusionAuth identity-provider name for the Microsoft (Outlook) IdP. Mirrors
/// the `google_gmail` name used for Gmail.
const OUTLOOK_IDENTITY_PROVIDER_NAME: &str = "microsoft_outlook";
/// Delegated Graph scopes. `offline_access` is required to receive a refresh
/// token; the Mail/User scopes back the mailbox operations `outlook_client`
/// performs. Must stay in sync with `fusionauth::microsoft::oauth`.
const OUTLOOK_SCOPES: &str = "offline_access openid profile email https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read";

#[derive(serde::Deserialize, serde::Serialize, Debug, utoipa::ToSchema)]
pub struct InitOutlookLinkResponse {
    /// The OAuth authorization URL to redirect the user to
    pub authorization_url: String,
    /// The link ID for tracking the OAuth flow
    pub link_id: uuid::Uuid,
}

/// Error type for init Outlook operations
#[derive(thiserror::Error, Debug)]
pub enum InitOutlookLinkError {
    /// Too many in-progress links
    #[error("too many in progress links")]
    TooManyInProgressLinks,
    /// Internal error
    #[error("internal error occurred")]
    InternalError(#[from] anyhow::Error),
    /// The identity provider was not found
    #[error("identity provider not found")]
    IdentityProviderNotFound,
}

impl IntoResponse for InitOutlookLinkError {
    fn into_response(self) -> Response {
        let message = self.to_string();
        let status_code: StatusCode = match &self {
            InitOutlookLinkError::TooManyInProgressLinks => StatusCode::TOO_MANY_REQUESTS,
            InitOutlookLinkError::InternalError(_)
            | InitOutlookLinkError::IdentityProviderNotFound => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };

        (
            status_code,
            Json(ErrorResponse {
                message: message.into(),
            }),
        )
            .into_response()
    }
}

#[derive(Debug, serde::Deserialize)]
pub(crate) struct InitOutlookLinkQueryParams {
    /// Once the frontend is updated to NOT 2x urlencode this then this should be
    /// changed to `Option<Url>`
    original_url: Option<UrlEncoded<Url>>,
}

/// Initiates an Outlook link for a user.
#[utoipa::path(
        post,
        operation_id = "init_outlook_link",
        path = "/link/outlook",
        params(
            ("original_url" = String, Query, description = "**OPTIONAL**. The original url to redirect to.")
        ),
        responses(
            (status = 200, body=InitOutlookLinkResponse),
            (status = 400, body=ErrorResponse),
            (status = 429, body=ErrorResponse),
            (status = 401, body=ErrorResponse),
            (status = 500, body=ErrorResponse),
        )
    )]
#[tracing::instrument(skip(ctx, ip_context, user_context), fields(client_ip=%ip_context, user_id=%user_context.user_context.user_id, fusion_user_id=%user_context.user_context.fusion_user_id), err)]
pub async fn init_outlook_link_handler(
    State(ctx): State<ApiContext>,
    query: Query<InitOutlookLinkQueryParams>,
    ip_context: ClientIp,
    user_context: MacroUserExtractor,
) -> Result<Json<InitOutlookLinkResponse>, InitOutlookLinkError> {
    let Query(InitOutlookLinkQueryParams { original_url }) = query;

    let count =
        macro_db_client::in_progress_user_link::count_existing_in_progress_user_links_for_user(
            &ctx.db,
            &user_context.user_context.fusion_user_id,
        )
        .await?;

    if count >= 5 {
        return Err(InitOutlookLinkError::TooManyInProgressLinks);
    }

    let link_id = macro_db_client::in_progress_user_link::create_in_progress_user_link(
        &ctx.db,
        &user_context.user_context.fusion_user_id,
    )
    .await?;

    let outlook_idp_id = ctx
        .auth_client
        .get_identity_provider_id_by_name(OUTLOOK_IDENTITY_PROVIDER_NAME)
        .await
        .map_err(|_| InitOutlookLinkError::IdentityProviderNotFound)?;

    let state = OAuthState {
        identity_provider_id: outlook_idp_id,
        link_id: Some(link_id),
        original_url: original_url.map(|x| x.0.to_string()),
        is_mobile: None,
    };

    let redirect_uri = crate::api::oauth2::format_redirect_uri("microsoft");
    let state_str = serde_json::to_string(&state).context("failed to serialize OAuth state")?;

    let mut authorization_url = Url::parse(MICROSOFT_AUTHORIZATION_URL)
        .context("invalid Microsoft authorization URL")?;
    authorization_url
        .query_pairs_mut()
        .append_pair("client_id", ctx.auth_client.microsoft_client_id())
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("response_mode", "query")
        .append_pair("scope", OUTLOOK_SCOPES)
        .append_pair("state", &state_str)
        // Force the consent screen so a refresh token is always issued.
        .append_pair("prompt", "consent");

    Ok(Json(InitOutlookLinkResponse {
        authorization_url: authorization_url.to_string(),
        link_id,
    }))
}

#[derive(serde::Deserialize, serde::Serialize, Debug, utoipa::ToSchema)]
pub struct OutlookLinkStatusResponse {
    /// Whether the user must reauthenticate their Outlook link.
    pub reauthentication_required: bool,
}

#[derive(thiserror::Error, Debug)]
pub enum OutlookLinkStatusError {
    #[error("reauthentication required")]
    ReauthenticationRequired,
    #[error("internal")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for OutlookLinkStatusError {
    fn into_response(self) -> Response {
        match &self {
            OutlookLinkStatusError::ReauthenticationRequired => (
                StatusCode::PRECONDITION_REQUIRED,
                Json(ErrorResponse {
                    message: REAUTHENTICATION_REQUIRED_MESSAGE.into(),
                }),
            ),
            OutlookLinkStatusError::Internal(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "internal error occurred".into(),
                }),
            ),
        }
        .into_response()
    }
}

/// Checks whether the authenticated user's Outlook link is valid.
#[utoipa::path(
        get,
        operation_id = "check_outlook_link_status",
        path = "/link/outlook/status",
        responses(
            (status = 200, body=OutlookLinkStatusResponse),
            (status = 401, body=ErrorResponse),
            (status = 404, body=ErrorResponse),
            (status = 428, body=ErrorResponse),
            (status = 500, body=ErrorResponse),
        )
    )]
#[tracing::instrument(skip(ctx, ip_context, user_context), fields(client_ip=%ip_context, user_id=%user_context.macro_user_id), err)]
pub async fn check_outlook_link_status_handler(
    State(ctx): State<ApiContext>,
    ip_context: ClientIp,
    user_context: MacroUserExtractor,
) -> Result<Json<OutlookLinkStatusResponse>, OutlookLinkStatusError> {
    // Check if the user has an email link in db
    if macro_db_client::email::check_user_email_link(&ctx.db, &user_context.macro_user_id)
        .await
        .map_err(OutlookLinkStatusError::Internal)?
    {
        let links = ctx
            .auth_client
            .get_links(&user_context.user_context.fusion_user_id, None)
            .await
            .map_err(|e| OutlookLinkStatusError::Internal(e.into()))?;

        let has_outlook_link = links
            .iter()
            .any(|l| l.identity_provider_name.eq(OUTLOOK_IDENTITY_PROVIDER_NAME));

        // If no, return 428
        if !has_outlook_link {
            return Err(OutlookLinkStatusError::ReauthenticationRequired);
        }
    }

    Ok(Json(OutlookLinkStatusResponse {
        reauthentication_required: false,
    }))
}
