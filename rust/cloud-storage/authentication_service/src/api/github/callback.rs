use std::borrow::Cow;

use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect, Response},
};
use chrono::Utc;

use crate::api::{
    context::ApiContext,
    oauth2::{OAuthState, format_redirect_uri},
};
use authentication_service::service::fusionauth_client::identity_provider::{
    IdentityProviderLink, LinkUserRequest,
};
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

    // Exchange code for access token
    let token_response = ctx
        .auth_client
        .exchange_github_code_for_tokens(&params.code, &format_redirect_uri("github"))
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to exchange code for tokens");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "OAuth token exchange failed",
                }),
            )
                .into_response()
        })?;

    // Get GitHub user info
    let user_info = ctx
        .auth_client
        .get_github_user_info(&token_response.access_token)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to get GitHub user info");
            let error_message = e.to_string();
            let display_message = if error_message.contains("verify") || error_message.contains("email") {
                &error_message
            } else {
                "failed to retrieve GitHub user information"
            };
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    message: display_message,
                }),
            )
                .into_response()
        })?;

    // Check if GitHub account is already linked to a different user
    let existing_link = macro_db_client::github_links::get::get_link_by_github_user_id(
        &ctx.db,
        &user_info.id.to_string(),
    )
    .await
    .map_err(|e| {
        tracing::error!(error=?e, "failed to check existing GitHub link");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                message: "unable to verify GitHub account status",
            }),
        )
            .into_response()
    })?;

    if let Some(existing) = existing_link {
        if existing.fusionauth_user_id != macro_user_id {
            // GitHub account already linked to different Macro user
            // Clean up in_progress_user_link
            let _ = macro_db_client::in_progress_user_link::delete_in_progress_user_link(
                &ctx.db, &link_id,
            )
            .await;

            return Err((
                StatusCode::CONFLICT,
                Json(ErrorResponse {
                    message: "This GitHub account is already linked to another Macro account",
                }),
            )
                .into_response());
        }
    }

    // Get GitHub integration identity provider ID from context
    let github_idp_id = &ctx.github_idp_id;

    ctx.auth_client
        .link_user(LinkUserRequest {
            identity_provider_link: IdentityProviderLink {
                display_name: Cow::Borrowed(&user_info.login),
                identity_provider_id: Cow::Borrowed(github_idp_id),
                identity_provider_user_id: Cow::Borrowed(&user_info.id.to_string()),
                user_id: Cow::Borrowed(&macro_user_id.to_string()),
                token: Cow::Borrowed(&token_response.access_token),
            },
        })
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to link user in FusionAuth");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "unable to link GitHub account",
                }),
            )
                .into_response()
        })?;

    // Create github_links record
    let link = macro_db_client::github_links::insert::GitHubLink {
        id: macro_uuid::generate_uuid_v7(),
        macro_id: macro_user_id.to_string(),
        fusionauth_user_id: macro_user_id,
        github_username: user_info.login.clone(),
        github_user_id: user_info.id.to_string(),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    tracing::info!(
        fusionauth_user_id=%macro_user_id,
        github_user_id=%user_info.id,
        github_username=%user_info.login,
        "attempting to create github_links record"
    );

    macro_db_client::github_links::insert::create_github_link(&ctx.db, link)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to create github_links record");
            // Try to clean up FusionAuth link
            let cleanup_ctx = ctx.clone();
            let cleanup_user_id = macro_user_id.to_string();
            let cleanup_github_id = user_info.id.to_string();
            let cleanup_github_idp_id = github_idp_id.clone();
            tokio::spawn(async move {
                let _ = cleanup_ctx
                    .auth_client
                    .unlink_user(&cleanup_user_id, &cleanup_github_idp_id, &cleanup_github_id)
                    .await;
            });

            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "unable to save GitHub link",
                }),
            )
                .into_response()
        })?;

    tracing::info!("successfully created github_links record");

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
