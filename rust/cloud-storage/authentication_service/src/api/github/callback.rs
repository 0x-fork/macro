use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect, Response},
};

use crate::api::{
    context::ApiContext,
    oauth2::{OAuthState, format_redirect_uri},
};
use github_integration::{GitHubOAuthClient, link_github_account};
use model::response::ErrorResponse;

#[derive(serde::Deserialize)]
pub struct CallbackParams {
    code: String,
    state: String,
}

/// GitHub OAuth callback handler (integration only, not login)
#[tracing::instrument(skip(ctx, params))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    Query(params): Query<CallbackParams>,
) -> Result<Response, Response> {
    tracing::info!("github callback handler called");

    // Parse OAuth state
    let state: OAuthState = serde_json::from_str(&params.state).map_err(|e| {
        tracing::error!(error=?e, "failed to parse OAuth state");
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                message: "invalid OAuth state",
            }),
        )
            .into_response()
    })?;

    // Extract link_id - this must be present for integration flow
    let link_id = state.link_id.ok_or_else(|| {
        tracing::error!("link_id not present in OAuth state");
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                message: "invalid OAuth flow - missing link_id",
            }),
        )
            .into_response()
    })?;

    // Get macro_user_id from in_progress_user_link
    let macro_user_id =
        macro_db_client::in_progress_user_link::get_macro_user_id_by_link_id(&ctx.db, &link_id)
            .await
            .map_err(|e| {
                tracing::error!(error=?e, "failed to get macro_user_id from link_id");
                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        message: "invalid or expired OAuth state",
                    }),
                )
                    .into_response()
            })?;

    // Use github_integration to link the account
    let oauth_client = GitHubOAuthClient::new();
    let user_info = match link_github_account(
        &ctx.db,
        &*ctx.auth_client,
        &oauth_client,
        &ctx.github_config,
        &format_redirect_uri("github"),
        &params.code,
        macro_user_id,
    )
    .await
    {
        Ok(info) => info,
        Err(e) => {
            tracing::error!(error=?e, "failed to link GitHub account");

            // Clean up in_progress_user_link
            let _ = macro_db_client::in_progress_user_link::delete_in_progress_user_link(
                &ctx.db, &link_id,
            )
            .await;

            let (status_code, message) = match e {
                github_integration::GitHubIntegrationError::AccountAlreadyLinked => {
                    (StatusCode::CONFLICT, "This GitHub account is already linked to another Macro account")
                }
                github_integration::GitHubIntegrationError::TokenExchangeFailed(_) => {
                    (StatusCode::INTERNAL_SERVER_ERROR, "OAuth token exchange failed")
                }
                github_integration::GitHubIntegrationError::UserInfoFailed(ref msg)
                    if msg.contains("verify") || msg.contains("email") => {
                    (StatusCode::BAD_REQUEST, msg.as_str())
                }
                github_integration::GitHubIntegrationError::UserInfoFailed(_) => {
                    (StatusCode::BAD_REQUEST, "failed to retrieve GitHub user information")
                }
                github_integration::GitHubIntegrationError::FusionAuthLinkingFailed(_) => {
                    (StatusCode::INTERNAL_SERVER_ERROR, "unable to link GitHub account")
                }
                _ => (StatusCode::INTERNAL_SERVER_ERROR, "unable to link GitHub account"),
            };

            return Err((
                status_code,
                Json(ErrorResponse {
                    message,
                }),
            )
                .into_response());
        }
    };

    tracing::info!(
        fusionauth_user_id=%macro_user_id,
        github_user_id=%user_info.id,
        github_username=%user_info.login,
        "successfully linked GitHub account"
    );

    // Delete in_progress_user_link
    let _ = macro_db_client::in_progress_user_link::delete_in_progress_user_link(&ctx.db, &link_id)
        .await
        .inspect_err(|e| {
            tracing::error!(error=?e, "failed to delete in_progress_user_link");
        });

    // Redirect to success page or original URL
    let redirect_url = state
        .original_url
        .unwrap_or_else(|| "/app/settings".to_string());

    Ok(Redirect::to(&redirect_url).into_response())
}
