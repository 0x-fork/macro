use axum::{
    Json,
    response::{Html, IntoResponse, Response},
};
use github_integration::{GitHubOAuthClient, link_github_account};
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

async fn link_user(
    ctx: &ApiContext,
    code: &str,
    link_id: &str,
) -> Result<(), (StatusCode, String)> {
    // Get existing macro user id from link id
    let macro_user_id =
        macro_db_client::in_progress_user_link::get_macro_user_id_by_link_id(&ctx.db, link_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Use github_integration to link the account
    let oauth_client = GitHubOAuthClient::new();
    let user_info = link_github_account(
        &ctx.db,
        &*ctx.auth_client,
        &oauth_client,
        &ctx.github_config,
        &format_redirect_uri("github"),
        code,
        macro_user_id,
    )
    .await
    .map_err(|e| {
        tracing::error!(error=?e, "failed to link GitHub account");

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

        (status_code, message.to_string())
    })?;

    tracing::info!(
        fusionauth_user_id=%macro_user_id,
        github_user_id=%user_info.id,
        github_username=%user_info.login,
        "successfully linked GitHub account"
    );

    // Delete in_progress_user_link
    let _ = macro_db_client::in_progress_user_link::delete_in_progress_user_link(&ctx.db, link_id)
        .await
        .inspect_err(|e| {
            tracing::error!(error=?e, "failed to delete in_progress_user_link");
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
        link_user(ctx, code, link_id)
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
