use axum::{
    extract::{Query, State},
    response::{IntoResponse, Redirect},
};

use crate::api::{
    context::ApiContext,
    oauth2::{OAuthState, format_redirect_uri},
};
use github_integration::{GitHubIntegrationError, GitHubOAuthClient, link_github_account};

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
) -> Result<impl IntoResponse, GitHubIntegrationError> {
    tracing::info!("github callback handler called");

    // Parse OAuth state
    let state: OAuthState = serde_json::from_str(&params.state)
        .inspect_err(|e| {
            tracing::error!(error=?e, "failed to parse OAuth state");
        })?;

    // Extract link_id - this must be present for integration flow
    let link_id = state.link_id.ok_or_else(|| {
        tracing::error!("link_id not present in OAuth state");
        GitHubIntegrationError::MissingLinkId
    })?;

    // Get macro_user_id from in_progress_user_link
    let macro_user_id =
        macro_db_client::in_progress_user_link::get_macro_user_id_by_link_id(&ctx.db, &link_id)
            .await
            .inspect_err(|e| {
                tracing::error!(error=?e, "failed to get macro_user_id from link_id");
            })
            .map_err(|_| GitHubIntegrationError::InvalidOrExpiredOAuthState)?;

    // Use github_integration to link the account
    let oauth_client = GitHubOAuthClient::new();
    let user_info = link_github_account(
        &ctx.db,
        &*ctx.auth_client,
        &oauth_client,
        &ctx.github_config,
        &format_redirect_uri("github"),
        &params.code,
        macro_user_id,
    )
    .await
    .inspect_err(|e| {
        tracing::error!(error=?e, "failed to link GitHub account");

        // Clean up in_progress_user_link
        let ctx_db = ctx.db.clone();
        let link_id = link_id.clone();
        tokio::spawn(async move {
            let _ = macro_db_client::in_progress_user_link::delete_in_progress_user_link(
                &ctx_db, &link_id,
            )
            .await;
        });
    })?;

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
