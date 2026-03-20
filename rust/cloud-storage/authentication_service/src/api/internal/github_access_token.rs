use axum::{
    Json,
    extract::{self, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use fusionauth::FusionAuthClient;
use macro_middleware::auth::internal_access::ValidInternalKey;
use model::authentication::github_token::GithubAccessToken;
use model::response::ErrorResponse;
use std::sync::Arc;

#[derive(serde::Deserialize, Debug)]
pub struct GithubAccessTokenParams {
    fusionauth_user_id: String,
}

/// Gets the github access token for the linked user.
#[tracing::instrument(skip(auth_client, _internal_access))]
pub async fn handler(
    State(auth_client): State<Arc<FusionAuthClient>>,
    _internal_access: ValidInternalKey,
    extract::Query(params): extract::Query<GithubAccessTokenParams>,
) -> Result<Response, Response> {
    let idp_id = auth_client
        .get_identity_provider_id_by_name("github")
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "unable to find github identity provider id");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "unable to find github identity provider",
                }),
            )
                .into_response()
        })?;

    let links = auth_client
        .get_links(&params.fusionauth_user_id, Some(idp_id.clone()))
        .await
        .map_err(|e| {
            tracing::error!(
                error=?e,
                fusionauth_user_id=%params.fusionauth_user_id,
                idp_id=%idp_id,
                "error fetching github links"
            );
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "unable to fetch github links",
                }),
            )
                .into_response()
        })?;

    let link = links.first().ok_or_else(|| {
        tracing::warn!(
            fusionauth_user_id=%params.fusionauth_user_id,
            "github link not found for user"
        );
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                message: "No github link found for this user",
            }),
        )
            .into_response()
    })?;

    Ok((
        StatusCode::OK,
        Json(GithubAccessToken {
            access_token: link.token.clone(),
        }),
    )
        .into_response())
}
