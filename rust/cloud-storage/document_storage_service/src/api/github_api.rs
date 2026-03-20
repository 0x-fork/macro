use crate::api::context::ApiContext;
use anyhow::Context as _;
use authentication_service_client::error::AuthServiceClientError;
use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
};
use model::{response::ErrorResponse, user::UserContext};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use thiserror::Error;

pub fn router(state: ApiContext) -> Router<ApiContext> {
    let github_sync_router_state = github::inbound::github_sync_router::GithubSyncRouterState {
        service: state.github_sync_service.clone(),
    };

    Router::new()
        .merge(github::inbound::github_sync_router::github_sync_router(
            github_sync_router_state,
        ))
        .route("/pull_requests", get(list_pull_requests_handler))
        .route("/pull_requests/{pr_id}", get(get_pull_request_handler))
}

#[derive(Debug, Serialize, Clone)]
pub struct GithubPullRequestSummary {
    pub id: String,
    pub number: u64,
    pub title: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub repo_full_name: String,
    pub state: String,
    pub comment_count: u64,
    pub html_url: String,
    pub created_at: String,
    pub updated_at: String,
    pub author_login: String,
    pub author_avatar_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GithubPullRequestListResponse {
    pub pull_requests: Vec<GithubPullRequestSummary>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GithubPullRequestComment {
    IssueComment {
        id: u64,
        author_login: String,
        author_avatar_url: Option<String>,
        author_association: Option<String>,
        body: String,
        created_at: String,
        html_url: String,
    },
    Review {
        id: u64,
        author_login: String,
        author_avatar_url: Option<String>,
        state: String,
        body: Option<String>,
        created_at: String,
        html_url: String,
    },
    ReviewComment {
        id: u64,
        author_login: String,
        author_avatar_url: Option<String>,
        author_association: Option<String>,
        body: String,
        created_at: String,
        html_url: String,
        path: Option<String>,
        line: Option<u64>,
        diff_hunk: Option<String>,
    },
}

impl GithubPullRequestComment {
    fn created_at(&self) -> &str {
        match self {
            Self::IssueComment { created_at, .. }
            | Self::Review { created_at, .. }
            | Self::ReviewComment { created_at, .. } => created_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct GithubPullRequestDetail {
    pub id: String,
    pub number: u64,
    pub title: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub repo_full_name: String,
    pub state: String,
    pub raw_state: String,
    pub is_draft: bool,
    pub html_url: String,
    pub body: Option<String>,
    pub author_login: String,
    pub author_avatar_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    pub merged_at: Option<String>,
    pub base_branch: String,
    pub head_branch: String,
    pub additions: u64,
    pub deletions: u64,
    pub changed_files: u64,
    pub commits: u64,
    pub issue_comment_count: u64,
    pub review_comment_count: u64,
    pub requested_reviewers: Vec<String>,
    pub labels: Vec<String>,
    pub comments: Vec<GithubPullRequestComment>,
}

#[tracing::instrument(skip(ctx, user_context))]
async fn list_pull_requests_handler(
    State(ctx): State<ApiContext>,
    Extension(user_context): Extension<UserContext>,
) -> Result<Json<GithubPullRequestListResponse>, Response> {
    let Some(access_token) = get_github_access_token(&ctx, &user_context).await? else {
        return Ok(Json(GithubPullRequestListResponse {
            pull_requests: vec![],
        }));
    };

    let client = GithubRestClient::default();
    let pull_requests = client
        .list_pull_requests(&access_token)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to list github pull requests");
            internal_error_response("unable to list github pull requests")
        })?;

    Ok(Json(GithubPullRequestListResponse { pull_requests }))
}

#[tracing::instrument(skip(ctx, user_context))]
async fn get_pull_request_handler(
    State(ctx): State<ApiContext>,
    Extension(user_context): Extension<UserContext>,
    Path(pr_id): Path<String>,
) -> Result<Json<GithubPullRequestDetail>, Response> {
    let (repo_owner, repo_name, number) = parse_pull_request_id(&pr_id).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                message: "invalid pull request id",
            }),
        )
            .into_response()
    })?;

    let access_token = get_github_access_token(&ctx, &user_context)
        .await?
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    message: "github account not linked",
                }),
            )
                .into_response()
        })?;

    let client = GithubRestClient::default();
    let detail = client
        .get_pull_request_detail(&access_token, &repo_owner, &repo_name, number)
        .await
        .map_err(|error| match error {
            GithubApiError::NotFound => (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    message: "github pull request not found",
                }),
            )
                .into_response(),
            GithubApiError::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    message: "github access is unauthorized",
                }),
            )
                .into_response(),
            GithubApiError::Internal(error) => {
                tracing::error!(
                    error=?error,
                    repo_owner=%repo_owner,
                    repo_name=%repo_name,
                    number,
                    "failed to fetch github pull request detail"
                );
                internal_error_response("unable to fetch github pull request")
            }
        })?;

    Ok(Json(detail))
}

async fn get_github_access_token(
    ctx: &ApiContext,
    user_context: &UserContext,
) -> Result<Option<String>, Response> {
    if user_context.fusion_user_id.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                message: "unauthorized",
            }),
        )
            .into_response());
    }

    match ctx
        .auth_service_client
        .get_github_access_token(&user_context.fusion_user_id)
        .await
    {
        Ok(token) => Ok(Some(token.access_token)),
        Err(AuthServiceClientError::NotFound) => Ok(None),
        Err(error) => {
            tracing::error!(error=?error, "failed to get github access token");
            Err(internal_error_response("unable to get github access token"))
        }
    }
}

fn internal_error_response(message: &'static str) -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse { message }),
    )
        .into_response()
}

fn format_pull_request_id(repo_owner: &str, repo_name: &str, number: u64) -> String {
    format!("{repo_owner}:{repo_name}:{number}")
}

fn parse_pull_request_id(pr_id: &str) -> Option<(String, String, u64)> {
    let mut parts = pr_id.splitn(3, ':');
    let repo_owner = parts.next()?.to_string();
    let repo_name = parts.next()?.to_string();
    let number = parts.next()?.parse().ok()?;

    if repo_owner.is_empty() || repo_name.is_empty() {
        return None;
    }

    Some((repo_owner, repo_name, number))
}

fn parse_repository_url(repository_url: &str) -> Option<(String, String)> {
    let path = repository_url
        .trim_end_matches('/')
        .split("/repos/")
        .nth(1)?;

    let mut parts = path.split('/');
    let repo_owner = parts.next()?.to_string();
    let repo_name = parts.next()?.to_string();

    if repo_owner.is_empty() || repo_name.is_empty() {
        return None;
    }

    Some((repo_owner, repo_name))
}

#[derive(Debug, Error)]
enum GithubApiError {
    #[error("github resource not found")]
    NotFound,
    #[error("github access is unauthorized")]
    Unauthorized,
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl GithubApiError {
    fn from_status(status: StatusCode, body: impl Into<String>) -> Self {
        match status {
            StatusCode::NOT_FOUND => Self::NotFound,
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Self::Unauthorized,
            _ => Self::Internal(anyhow::anyhow!(
                "github request failed with status {status}: {}",
                body.into()
            )),
        }
    }
}

#[derive(Clone, Default)]
struct GithubRestClient {
    client: reqwest::Client,
}

impl GithubRestClient {
    #[tracing::instrument(skip(self, access_token))]
    async fn list_pull_requests(
        &self,
        access_token: &str,
    ) -> Result<Vec<GithubPullRequestSummary>, GithubApiError> {
        let response: GithubSearchIssuesResponse = self
            .get_json(
                "https://api.github.com/search/issues",
                access_token,
                &[
                    ("q".to_string(), "is:pr author:@me".to_string()),
                    ("sort".to_string(), "updated".to_string()),
                    ("order".to_string(), "desc".to_string()),
                    ("per_page".to_string(), "100".to_string()),
                ],
            )
            .await?;

        Ok(response
            .items
            .into_iter()
            .filter_map(|item| {
                let _ = item.pull_request.as_ref()?;
                let (repo_owner, repo_name) = parse_repository_url(&item.repository_url)?;

                Some(GithubPullRequestSummary {
                    id: format_pull_request_id(&repo_owner, &repo_name, item.number),
                    number: item.number,
                    title: item.title,
                    repo_full_name: format!("{repo_owner}/{repo_name}"),
                    repo_owner,
                    repo_name,
                    state: item.state,
                    comment_count: item.comments,
                    html_url: item.html_url,
                    created_at: item.created_at,
                    updated_at: item.updated_at,
                    author_login: item.user.login,
                    author_avatar_url: item.user.avatar_url,
                })
            })
            .collect())
    }

    #[tracing::instrument(skip(self, access_token))]
    async fn get_pull_request_detail(
        &self,
        access_token: &str,
        repo_owner: &str,
        repo_name: &str,
        number: u64,
    ) -> Result<GithubPullRequestDetail, GithubApiError> {
        let pr_url =
            format!("https://api.github.com/repos/{repo_owner}/{repo_name}/pulls/{number}");
        let issue_comments_url = format!(
            "https://api.github.com/repos/{repo_owner}/{repo_name}/issues/{number}/comments"
        );
        let reviews_url =
            format!("https://api.github.com/repos/{repo_owner}/{repo_name}/pulls/{number}/reviews");
        let review_comments_url = format!(
            "https://api.github.com/repos/{repo_owner}/{repo_name}/pulls/{number}/comments"
        );

        let pr: GithubPullRequestResponse = self.get_json(&pr_url, access_token, &[]).await?;
        let (issue_comments, reviews, review_comments) = tokio::try_join!(
            self.get_paginated_json::<GithubIssueCommentResponse>(
                &issue_comments_url,
                access_token
            ),
            self.get_paginated_json::<GithubReviewResponse>(&reviews_url, access_token),
            self.get_paginated_json::<GithubReviewCommentResponse>(
                &review_comments_url,
                access_token
            ),
        )?;

        let mut comments =
            Vec::with_capacity(issue_comments.len() + reviews.len() + review_comments.len());

        comments.extend(issue_comments.into_iter().map(|comment| {
            GithubPullRequestComment::IssueComment {
                id: comment.id,
                author_login: comment
                    .user
                    .as_ref()
                    .map(|user| user.login.clone())
                    .unwrap_or_else(|| "unknown".to_string()),
                author_avatar_url: comment.user.and_then(|user| user.avatar_url),
                author_association: comment.author_association,
                body: comment.body,
                created_at: comment.created_at,
                html_url: comment.html_url,
            }
        }));

        comments.extend(reviews.into_iter().map(|review| {
            GithubPullRequestComment::Review {
                id: review.id,
                author_login: review
                    .user
                    .as_ref()
                    .map(|user| user.login.clone())
                    .unwrap_or_else(|| "unknown".to_string()),
                author_avatar_url: review.user.and_then(|user| user.avatar_url),
                state: review.state,
                body: review.body,
                created_at: review.submitted_at.unwrap_or_default(),
                html_url: review.html_url,
            }
        }));

        comments.extend(review_comments.into_iter().map(|comment| {
            GithubPullRequestComment::ReviewComment {
                id: comment.id,
                author_login: comment
                    .user
                    .as_ref()
                    .map(|user| user.login.clone())
                    .unwrap_or_else(|| "unknown".to_string()),
                author_avatar_url: comment.user.and_then(|user| user.avatar_url),
                author_association: comment.author_association,
                body: comment.body,
                created_at: comment.created_at,
                html_url: comment.html_url,
                path: comment.path,
                line: comment.line,
                diff_hunk: comment.diff_hunk,
            }
        }));

        comments.sort_by(|a, b| a.created_at().cmp(b.created_at()));

        Ok(GithubPullRequestDetail {
            id: format_pull_request_id(repo_owner, repo_name, pr.number),
            number: pr.number,
            title: pr.title,
            repo_owner: repo_owner.to_string(),
            repo_name: repo_name.to_string(),
            repo_full_name: format!("{repo_owner}/{repo_name}"),
            state: if pr.merged_at.is_some() {
                "merged".to_string()
            } else {
                pr.state.clone()
            },
            raw_state: pr.state,
            is_draft: pr.draft,
            html_url: pr.html_url,
            body: pr.body,
            author_login: pr.user.login,
            author_avatar_url: pr.user.avatar_url,
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            closed_at: pr.closed_at,
            merged_at: pr.merged_at,
            base_branch: pr.base.reference,
            head_branch: pr.head.reference,
            additions: pr.additions,
            deletions: pr.deletions,
            changed_files: pr.changed_files,
            commits: pr.commits,
            issue_comment_count: pr.comments,
            review_comment_count: pr.review_comments,
            requested_reviewers: pr
                .requested_reviewers
                .into_iter()
                .map(|reviewer| reviewer.login)
                .collect(),
            labels: pr.labels.into_iter().map(|label| label.name).collect(),
            comments,
        })
    }

    async fn get_paginated_json<T: DeserializeOwned>(
        &self,
        url: &str,
        access_token: &str,
    ) -> Result<Vec<T>, GithubApiError> {
        let mut page = 1;
        let mut items = Vec::new();

        loop {
            let batch: Vec<T> = self
                .get_json(
                    url,
                    access_token,
                    &[
                        ("per_page".to_string(), "100".to_string()),
                        ("page".to_string(), page.to_string()),
                    ],
                )
                .await?;

            let count = batch.len();
            items.extend(batch);

            if count < 100 {
                break;
            }

            page += 1;
        }

        Ok(items)
    }

    async fn get_json<T: DeserializeOwned>(
        &self,
        url: &str,
        access_token: &str,
        query: &[(String, String)],
    ) -> Result<T, GithubApiError> {
        let response = self
            .client
            .get(url)
            .query(query)
            .header("Authorization", format!("Bearer {access_token}"))
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "Macro-Document-Storage-Service")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .context("failed to send github request")?;

        let status = response.status();
        if status.is_success() {
            return response
                .json()
                .await
                .context("failed to decode github response")
                .map_err(Into::into);
        }

        match status {
            StatusCode::NOT_FOUND | StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                Err(GithubApiError::from_status(status, ""))
            }
            _ => {
                let body = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "unknown error".to_string());
                Err(GithubApiError::from_status(status, body))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct GithubSearchIssuesResponse {
    items: Vec<GithubSearchIssueItem>,
}

#[derive(Debug, Deserialize)]
struct GithubSearchIssueItem {
    title: String,
    number: u64,
    state: String,
    comments: u64,
    html_url: String,
    created_at: String,
    updated_at: String,
    repository_url: String,
    user: GithubUserSummary,
    pull_request: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct GithubPullRequestResponse {
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    draft: bool,
    html_url: String,
    created_at: String,
    updated_at: String,
    closed_at: Option<String>,
    merged_at: Option<String>,
    additions: u64,
    deletions: u64,
    changed_files: u64,
    commits: u64,
    comments: u64,
    review_comments: u64,
    user: GithubUserSummary,
    base: GithubBranchSummary,
    head: GithubBranchSummary,
    requested_reviewers: Vec<GithubUserSummary>,
    labels: Vec<GithubLabel>,
}

#[derive(Debug, Deserialize)]
struct GithubBranchSummary {
    #[serde(rename = "ref")]
    reference: String,
}

#[derive(Debug, Deserialize)]
struct GithubLabel {
    name: String,
}

#[derive(Debug, Deserialize)]
struct GithubIssueCommentResponse {
    id: u64,
    body: String,
    created_at: String,
    html_url: String,
    author_association: Option<String>,
    user: Option<GithubUserSummary>,
}

#[derive(Debug, Deserialize)]
struct GithubReviewResponse {
    id: u64,
    body: Option<String>,
    state: String,
    submitted_at: Option<String>,
    html_url: String,
    user: Option<GithubUserSummary>,
}

#[derive(Debug, Deserialize)]
struct GithubReviewCommentResponse {
    id: u64,
    body: String,
    created_at: String,
    html_url: String,
    author_association: Option<String>,
    path: Option<String>,
    line: Option<u64>,
    diff_hunk: Option<String>,
    user: Option<GithubUserSummary>,
}

#[derive(Debug, Deserialize, Clone)]
struct GithubUserSummary {
    login: String,
    avatar_url: Option<String>,
}

#[cfg(test)]
mod test {
    use axum::http::StatusCode;

    use super::{
        GithubApiError, format_pull_request_id, parse_pull_request_id, parse_repository_url,
    };

    #[test]
    fn round_trips_pull_request_id() {
        let id = format_pull_request_id("macro-inc", "app-monorepo", 42);

        assert_eq!(
            parse_pull_request_id(&id),
            Some(("macro-inc".to_string(), "app-monorepo".to_string(), 42))
        );
    }

    #[test]
    fn parses_repository_url() {
        assert_eq!(
            parse_repository_url("https://api.github.com/repos/macro-inc/app-monorepo"),
            Some(("macro-inc".to_string(), "app-monorepo".to_string()))
        );
    }

    #[test]
    fn rejects_invalid_pull_request_id() {
        assert_eq!(parse_pull_request_id("macro-inc:repo:not-a-number"), None);
        assert_eq!(parse_pull_request_id("macro-inc:repo"), None);
        assert_eq!(parse_pull_request_id(":repo:42"), None);
        assert_eq!(parse_pull_request_id("macro-inc::42"), None);
    }

    #[test]
    fn rejects_invalid_repository_url() {
        assert_eq!(
            parse_repository_url("https://api.github.com/orgs/macro-inc"),
            None
        );
        assert_eq!(
            parse_repository_url("https://api.github.com/repos//app-monorepo"),
            None
        );
    }

    #[test]
    fn maps_github_status_codes_to_domain_errors() {
        assert!(matches!(
            GithubApiError::from_status(StatusCode::NOT_FOUND, "missing"),
            GithubApiError::NotFound
        ));
        assert!(matches!(
            GithubApiError::from_status(StatusCode::UNAUTHORIZED, "unauthorized"),
            GithubApiError::Unauthorized
        ));
        assert!(matches!(
            GithubApiError::from_status(StatusCode::FORBIDDEN, "forbidden"),
            GithubApiError::Unauthorized
        ));
        assert!(matches!(
            GithubApiError::from_status(StatusCode::BAD_GATEWAY, "bad gateway"),
            GithubApiError::Internal(_)
        ));
    }
}
