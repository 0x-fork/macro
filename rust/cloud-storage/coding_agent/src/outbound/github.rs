//! A [`RepositoryLister`] backed by the GitHub REST API.
//!
//! v0 wiring uses a single token (e.g. a `GITHUB_TOKEN`) and lists that
//! account's repositories. The production path swaps the token source for the
//! per-user token resolved through macro's GitHub integration; the port and the
//! rest of the system are unchanged.

use async_trait::async_trait;
use serde::Deserialize;

use crate::domain::error::{CodingError, Result};
use crate::domain::models::RepoRef;
use crate::domain::ports::RepositoryLister;

const GITHUB_API: &str = "https://api.github.com";

/// Lists repositories via `GET /user/repos`.
pub struct GitHubApiRepositoryLister {
    client: reqwest::Client,
    token: String,
    max_pages: u32,
}

#[derive(Deserialize)]
struct GhOwner {
    login: String,
}

#[derive(Deserialize)]
struct GhRepo {
    name: String,
    owner: GhOwner,
    #[serde(default)]
    default_branch: Option<String>,
}

impl GitHubApiRepositoryLister {
    /// Build a lister for a fixed token.
    pub fn new(token: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            token: token.into(),
            max_pages: 5,
        }
    }
}

#[async_trait]
impl RepositoryLister for GitHubApiRepositoryLister {
    #[tracing::instrument(skip(self), err)]
    async fn list_for_user(&self, _user_id: &str) -> Result<Vec<RepoRef>> {
        let mut out = Vec::new();
        for page in 1..=self.max_pages {
            let url = format!(
                "{GITHUB_API}/user/repos?per_page=100&page={page}&sort=updated&affiliation=owner,collaborator,organization_member"
            );
            let resp = self
                .client
                .get(url)
                .header("Authorization", format!("Bearer {}", self.token))
                .header("Accept", "application/vnd.github+json")
                .header("User-Agent", "Macro-Coding-Agent")
                .header("X-GitHub-Api-Version", "2022-11-28")
                .send()
                .await
                .map_err(CodingError::sandbox)?;
            if !resp.status().is_success() {
                return Err(CodingError::sandbox(format!(
                    "list repositories failed ({})",
                    resp.status()
                )));
            }
            let repos: Vec<GhRepo> = resp.json().await.map_err(CodingError::sandbox)?;
            let count = repos.len();
            out.extend(repos.into_iter().map(|r| RepoRef {
                owner: r.owner.login,
                name: r.name,
                default_branch: r.default_branch,
            }));
            if count < 100 {
                break;
            }
        }
        Ok(out)
    }
}
