//! Google Drive OAuth link endpoints.
//!
//! Mirrors [`super::gmail`]: the user is sent to Google's consent screen with
//! Drive scopes, Google redirects back to the shared `/oauth2/google/callback`
//! (which creates the FusionAuth identity-provider link), and the frontend then
//! calls `finalize` to persist a `google_drive_links` row.

use anyhow::Context;
use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use chrono::Utc;
use google_drive::domain::models::{GOOGLE_DRIVE_IDENTITY_PROVIDER_NAME, GoogleDriveLink};
use google_drive::domain::ports::GoogleDriveRepo;
use google_drive::outbound::PgGoogleDriveLinkRepo;
use macro_middleware::tracking::ClientIp;
use model::response::ErrorResponse;
use model_user::axum_extractor::MacroUserExtractor;
use serde_utils::urlencode::UrlEncoded;
use url::Url;
use uuid::Uuid;

use crate::api::{context::ApiContext, oauth2::OAuthState};

const GOOGLE_AUTHORIZATION_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
/// Full read/write Drive access — lets the user browse and import any of their
/// folder trees (and leaves room for future write-back features).
const GOOGLE_DRIVE_SCOPES: &str = "openid profile email https://www.googleapis.com/auth/drive";

/// Error type for Google Drive link operations.
#[derive(thiserror::Error, Debug)]
pub enum GoogleDriveLinkError {
    /// Too many in-progress links for this user.
    #[error("too many in progress links")]
    TooManyInProgressLinks,
    /// No Google Drive identity-provider link exists yet.
    #[error("no google drive link found")]
    NoLinkFound,
    /// The `google_drive` identity provider was not found in FusionAuth.
    #[error("identity provider not found")]
    IdentityProviderNotFound,
    /// Internal error.
    #[error("internal error occurred")]
    InternalError(#[from] anyhow::Error),
}

impl IntoResponse for GoogleDriveLinkError {
    fn into_response(self) -> Response {
        let status_code = match &self {
            GoogleDriveLinkError::TooManyInProgressLinks => StatusCode::TOO_MANY_REQUESTS,
            GoogleDriveLinkError::NoLinkFound => StatusCode::NOT_FOUND,
            GoogleDriveLinkError::IdentityProviderNotFound
            | GoogleDriveLinkError::InternalError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        (
            status_code,
            Json(ErrorResponse {
                message: self.to_string().into(),
            }),
        )
            .into_response()
    }
}

#[derive(serde::Deserialize, serde::Serialize, Debug, utoipa::ToSchema)]
pub struct InitGoogleDriveLinkResponse {
    /// The OAuth authorization URL to redirect the user to.
    pub authorization_url: String,
    /// The link ID for tracking the OAuth flow.
    pub link_id: uuid::Uuid,
}

#[derive(Debug, serde::Deserialize)]
pub(crate) struct InitGoogleDriveLinkQueryParams {
    /// The original url to redirect back to after linking.
    original_url: Option<UrlEncoded<Url>>,
}

/// Initiates a Google Drive link for the authenticated user.
#[utoipa::path(
    post,
    operation_id = "init_google_drive_link",
    path = "/link/google-drive",
    params(
        ("original_url" = String, Query, description = "**OPTIONAL**. The original url to redirect to.")
    ),
    responses(
        (status = 200, body = InitGoogleDriveLinkResponse),
        (status = 429, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, ip_context, user_context), fields(client_ip = %ip_context, user_id = %user_context.user_context.user_id, fusion_user_id = %user_context.user_context.fusion_user_id), err)]
pub async fn init_google_drive_link_handler(
    State(ctx): State<ApiContext>,
    query: Query<InitGoogleDriveLinkQueryParams>,
    ip_context: ClientIp,
    user_context: MacroUserExtractor,
) -> Result<Json<InitGoogleDriveLinkResponse>, GoogleDriveLinkError> {
    let Query(InitGoogleDriveLinkQueryParams { original_url }) = query;

    let count =
        macro_db_client::in_progress_user_link::count_existing_in_progress_user_links_for_user(
            &ctx.db,
            &user_context.user_context.fusion_user_id,
        )
        .await?;

    if count >= 5 {
        return Err(GoogleDriveLinkError::TooManyInProgressLinks);
    }

    let link_id = macro_db_client::in_progress_user_link::create_in_progress_user_link(
        &ctx.db,
        &user_context.user_context.fusion_user_id,
    )
    .await?;

    let drive_idp_id = ctx
        .auth_client
        .get_identity_provider_id_by_name(GOOGLE_DRIVE_IDENTITY_PROVIDER_NAME)
        .await
        .map_err(|_| GoogleDriveLinkError::IdentityProviderNotFound)?;

    let state = OAuthState {
        identity_provider_id: drive_idp_id,
        link_id: Some(link_id),
        original_url: original_url.map(|x| x.0.to_string()),
        is_mobile: None,
    };

    let redirect_uri = crate::api::oauth2::format_redirect_uri("google");
    let state_str = serde_json::to_string(&state).context("failed to serialize OAuth state")?;

    let mut authorization_url =
        Url::parse(GOOGLE_AUTHORIZATION_URL).context("invalid Google authorization URL")?;
    authorization_url
        .query_pairs_mut()
        .append_pair("client_id", ctx.auth_client.google_client_id())
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", GOOGLE_DRIVE_SCOPES)
        .append_pair("state", &state_str)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");

    Ok(Json(InitGoogleDriveLinkResponse {
        authorization_url: authorization_url.to_string(),
        link_id,
    }))
}

#[derive(serde::Serialize, Debug, utoipa::ToSchema)]
pub struct FinalizeGoogleDriveLinkResponse {
    /// The connected Google account email.
    pub email: String,
}

/// Finalizes a Google Drive link after the OAuth callback.
///
/// The callback (`/oauth2/google/callback`) has already created the FusionAuth
/// identity-provider link; this authenticated endpoint reads the linked email
/// from FusionAuth and persists the `google_drive_links` row (so we have the
/// Macro user id, which the unauthenticated callback does not).
#[utoipa::path(
    post,
    operation_id = "finalize_google_drive_link",
    path = "/link/google-drive/finalize",
    responses(
        (status = 200, body = FinalizeGoogleDriveLinkResponse),
        (status = 404, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, ip_context, user_context), fields(client_ip = %ip_context, user_id = %user_context.macro_user_id), err)]
pub async fn finalize_google_drive_link_handler(
    State(ctx): State<ApiContext>,
    ip_context: ClientIp,
    user_context: MacroUserExtractor,
) -> Result<Json<FinalizeGoogleDriveLinkResponse>, GoogleDriveLinkError> {
    let fusion_user_id = &user_context.user_context.fusion_user_id;

    let drive_idp_id = ctx
        .auth_client
        .get_identity_provider_id_by_name(GOOGLE_DRIVE_IDENTITY_PROVIDER_NAME)
        .await
        .map_err(|_| GoogleDriveLinkError::IdentityProviderNotFound)?;

    let links = ctx
        .auth_client
        .get_links(fusion_user_id, Some(drive_idp_id))
        .await
        .map_err(|e| GoogleDriveLinkError::InternalError(e.into()))?;

    // We support one Drive link per user; pick the most recently created.
    let link = links
        .into_iter()
        .max_by_key(|l| l.insert_instant)
        .ok_or(GoogleDriveLinkError::NoLinkFound)?;

    let fusionauth_user_id =
        Uuid::parse_str(fusion_user_id).context("invalid fusionauth user id")?;
    let email = link.display_name;

    let now = Utc::now();
    PgGoogleDriveLinkRepo::new(ctx.db.clone())
        .upsert_link(&GoogleDriveLink {
            id: macro_uuid::generate_uuid_v7(),
            macro_id: user_context.macro_user_id.to_string(),
            fusionauth_user_id,
            email: email.clone(),
            created_at: now,
            updated_at: now,
        })
        .await
        .map_err(|e| GoogleDriveLinkError::InternalError(e.into()))?;

    Ok(Json(FinalizeGoogleDriveLinkResponse { email }))
}

#[derive(serde::Serialize, Debug, utoipa::ToSchema)]
pub struct GoogleDriveLinkStatusResponse {
    /// Whether the user has connected a Google Drive account.
    pub connected: bool,
    /// Whether a connected account needs to be reconnected (token revoked).
    pub reauthentication_required: bool,
}

/// Reports the Google Drive connection status for the authenticated user.
#[utoipa::path(
    get,
    operation_id = "check_google_drive_link_status",
    path = "/link/google-drive/status",
    responses(
        (status = 200, body = GoogleDriveLinkStatusResponse),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, ip_context, user_context), fields(client_ip = %ip_context, user_id = %user_context.macro_user_id), err)]
pub async fn check_google_drive_link_status_handler(
    State(ctx): State<ApiContext>,
    ip_context: ClientIp,
    user_context: MacroUserExtractor,
) -> Result<Json<GoogleDriveLinkStatusResponse>, GoogleDriveLinkError> {
    let connected = PgGoogleDriveLinkRepo::new(ctx.db.clone())
        .get_link_by_user_id(&user_context.macro_user_id.to_string())
        .await
        .map_err(|e| GoogleDriveLinkError::InternalError(e.into()))?
        .is_some();

    if !connected {
        return Ok(Json(GoogleDriveLinkStatusResponse {
            connected: false,
            reauthentication_required: false,
        }));
    }

    // Connected per our records — confirm the FusionAuth link still exists. If
    // it's gone the user revoked access and must reconnect.
    let drive_idp_id = ctx
        .auth_client
        .get_identity_provider_id_by_name(GOOGLE_DRIVE_IDENTITY_PROVIDER_NAME)
        .await
        .map_err(|_| GoogleDriveLinkError::IdentityProviderNotFound)?;

    let links = ctx
        .auth_client
        .get_links(
            &user_context.user_context.fusion_user_id,
            Some(drive_idp_id),
        )
        .await
        .map_err(|e| GoogleDriveLinkError::InternalError(e.into()))?;

    Ok(Json(GoogleDriveLinkStatusResponse {
        connected: true,
        reauthentication_required: links.is_empty(),
    }))
}

/// Disconnects the authenticated user's Google Drive account.
#[utoipa::path(
    delete,
    operation_id = "delete_google_drive_link",
    path = "/link/google-drive",
    responses(
        (status = 204, description = "Disconnected"),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, ip_context, user_context), fields(client_ip = %ip_context, user_id = %user_context.macro_user_id), err)]
pub async fn delete_google_drive_link_handler(
    State(ctx): State<ApiContext>,
    ip_context: ClientIp,
    user_context: MacroUserExtractor,
) -> Result<StatusCode, GoogleDriveLinkError> {
    let fusion_user_id = &user_context.user_context.fusion_user_id;

    let drive_idp_id = ctx
        .auth_client
        .get_identity_provider_id_by_name(GOOGLE_DRIVE_IDENTITY_PROVIDER_NAME)
        .await
        .map_err(|_| GoogleDriveLinkError::IdentityProviderNotFound)?;

    // Best-effort unlink of every Drive identity-provider link for this user.
    if let Ok(links) = ctx
        .auth_client
        .get_links(fusion_user_id, Some(drive_idp_id.clone()))
        .await
    {
        for link in links {
            let _ = ctx
                .auth_client
                .unlink_user(fusion_user_id, &drive_idp_id, &link.identity_provider_user_id)
                .await
                .inspect_err(|e| {
                    tracing::error!(error = ?e, "failed to unlink google drive identity provider")
                });
        }
    }

    PgGoogleDriveLinkRepo::new(ctx.db.clone())
        .delete_link_by_user_id(&user_context.macro_user_id.to_string())
        .await
        .map_err(|e| GoogleDriveLinkError::InternalError(e.into()))?;

    Ok(StatusCode::NO_CONTENT)
}
