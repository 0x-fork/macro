use std::borrow::Cow;

use axum::{
    Json,
    response::{Html, IntoResponse, Response},
};
use model::response::ErrorResponse;
use reqwest::StatusCode;
use tower_cookies::Cookies;

use crate::api::{
    context::ApiContext,
    oauth2::{
        OAuthState, format_redirect_uri,
        login::{self},
    },
};
use authentication_service::service::fusionauth_client::identity_provider::{
    IdentityProviderLink, LinkUserRequest,
};

async fn link_user(
    ctx: &ApiContext,
    identity_provider_id: &str,
    code: &str,
    link_id: &str,
) -> Result<(), (StatusCode, String)> {
    // Get existing macro user id from link id
    let macro_user_id =
        macro_db_client::in_progress_user_link::get_macro_user_id_by_link_id(&ctx.db, link_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Exchange code for GitHub tokens
    let token_response = ctx
        .auth_client
        .exchange_github_code_for_tokens(code, &format_redirect_uri("github"))
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("unable to exchange code for tokens {e}"),
            )
        })?;

    // Get GitHub user info
    let user_info = ctx
        .auth_client
        .get_github_user_info(&token_response.access_token)
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                format!("unable to get github user info: {e}"),
            )
        })?;

    // Link the GitHub account to the existing Macro user in FusionAuth
    ctx.auth_client
        .link_user(LinkUserRequest {
            identity_provider_link: IdentityProviderLink {
                display_name: Cow::Borrowed(&user_info.login),
                identity_provider_id: Cow::Borrowed(identity_provider_id),
                identity_provider_user_id: Cow::Borrowed(&user_info.id.to_string()),
                user_id: Cow::Borrowed(&macro_user_id.to_string()),
                token: Cow::Borrowed(&token_response.access_token),
            },
        })
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("unable to link GitHub account to user: {e}"),
            )
        })?;

    // Create github_links database record
    let github_link = macro_db_client::github_links::insert::GitHubLink {
        id: macro_uuid::generate_uuid_v7(),
        macro_id: macro_user_id.to_string(),
        fusionauth_user_id: macro_user_id,
        github_username: user_info.login.clone(),
        github_user_id: user_info.id.to_string(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    macro_db_client::github_links::insert::create_github_link(&ctx.db, github_link)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to create github_links record");
            // Try to clean up FusionAuth link
            let cleanup_ctx = ctx.clone();
            let cleanup_user_id = macro_user_id.to_string();
            let cleanup_github_id = user_info.id.to_string();
            let cleanup_github_idp_id = identity_provider_id.to_string();
            tokio::spawn(async move {
                let _ = cleanup_ctx
                    .auth_client
                    .unlink_user(&cleanup_user_id, &cleanup_github_idp_id, &cleanup_github_id)
                    .await;
            });

            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("unable to save GitHub link: {e}"),
            )
        })?;

    tracing::info!(
        fusionauth_user_id=%macro_user_id,
        github_user_id=%user_info.id,
        github_username=%user_info.login,
        "successfully created GitHub link"
    );

    // delete in_progress_user_link once complete
    let _ = macro_db_client::in_progress_user_link::delete_in_progress_user_link(&ctx.db, link_id)
        .await
        .inspect_err(|e| {
            tracing::error!(error=?e, "unable to delete in progress user link");
        });

    Ok(())
}

pub(in crate::api::oauth2) async fn handler(
    ctx: &ApiContext,
    cookies: Cookies,
    code: &str,
    state: &OAuthState,
) -> Result<Response, Response> {
    // if the link id is provided, this user is already logged in to an account. therefore, we
    // don't need to handle completing the login through fusionauth
    if let Some(link_id) = state.link_id.as_ref() {
        link_user(ctx, &state.identity_provider_id, code, link_id)
            .await
            .map_err(|(status_code, error)| {
                tracing::error!(error=?error, "unable to link user");
                (status_code, Json(ErrorResponse { message: &error })).into_response()
            })?;

        // Return HTML that notifies the opener window and closes the popup
        let html = r#"
            <!DOCTYPE html>
            <html>
            <head><title>GitHub Connected</title></head>
            <body>
                <script>
                    console.log('OAuth callback received');
                    if (window.opener) {
                        console.log('Sending message to opener window');
                        window.opener.postMessage({ type: 'github-linked', success: true }, '*');
                        console.log('Message sent, closing in 500ms');
                        setTimeout(() => {
                            window.close();
                        }, 500);
                    } else {
                        console.log('No opener window found');
                        window.close();
                    }
                </script>
                <p>GitHub account connected successfully. This window will close automatically...</p>
            </body>
            </html>
        "#;
        return Ok(Html(html).into_response());
    }

    // The user does not need a link, complete the standard idp login
    login::handler(ctx, cookies, code, "github", state).await
}
