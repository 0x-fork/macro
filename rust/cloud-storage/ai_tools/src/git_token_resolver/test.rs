use super::*;

use github::domain::models::{
    EnrichedGithubPullRequest, GithubAccessToken, GithubLink, GithubPullRequestRef,
};
use macro_user_id::{lowercased::Lowercase, user_id::MacroUserId};

/// A stub link service whose `get_access_token` returns a configurable result.
struct StubLinkService {
    result: fn() -> Result<GithubAccessToken, GithubError>,
}

impl GithubLinkService for StubLinkService {
    fn construct_oauth_url<T: serde::Serialize + std::fmt::Debug + 'static>(
        &self,
        _redirect_uri: &str,
        _state: T,
    ) -> Result<String, GithubError> {
        Ok(String::new())
    }

    async fn link_user(
        &self,
        _user_id: &MacroUserId<Lowercase<'static>>,
        _fusionauth_user_id: &uuid::Uuid,
        _in_progress_user_link: &uuid::Uuid,
        _redirect_uri: &str,
        _code: &str,
    ) -> Result<GithubLink, GithubError> {
        Err(GithubError::NoLinkFound)
    }

    async fn get_user_link(
        &self,
        _user_id: &MacroUserId<Lowercase<'static>>,
    ) -> Result<GithubLink, GithubError> {
        Err(GithubError::NoLinkFound)
    }

    async fn delete_user_link(
        &self,
        _user_id: &MacroUserId<Lowercase<'static>>,
    ) -> Result<(), GithubError> {
        Ok(())
    }

    async fn check_user_link_token(
        &self,
        _user_id: &MacroUserId<Lowercase<'static>>,
    ) -> Result<(), GithubError> {
        Ok(())
    }

    async fn get_access_token(
        &self,
        _user_id: &MacroUserId<Lowercase<'static>>,
    ) -> Result<GithubAccessToken, GithubError> {
        (self.result)()
    }

    async fn enrich_pull_requests(
        &self,
        _user_id: &MacroUserId<Lowercase<'static>>,
        _pull_requests: Vec<GithubPullRequestRef>,
    ) -> Result<Vec<EnrichedGithubPullRequest>, GithubError> {
        Ok(Vec::new())
    }
}

const USER_ID: &str = "macro|teo@macro.com";

#[tokio::test]
async fn returns_token_for_linked_user() {
    let resolver = GithubLinkTokenResolver::new(StubLinkService {
        result: || Ok(GithubAccessToken::new("ghp_secret".to_owned())),
    });

    let token = resolver.github_token(USER_ID).await.unwrap();
    assert_eq!(token.as_deref(), Some("ghp_secret"));
}

#[tokio::test]
async fn unlinked_user_is_unauthorized() {
    let resolver = GithubLinkTokenResolver::new(StubLinkService {
        result: || Err(GithubError::NoLinkFound),
    });

    let err = resolver.github_token(USER_ID).await.unwrap_err();
    assert!(matches!(err, CodingAgentError::Unauthorized(_)));
}

#[tokio::test]
async fn expired_token_is_unauthorized() {
    let resolver = GithubLinkTokenResolver::new(StubLinkService {
        result: || Err(GithubError::ReauthenticationRequired),
    });

    let err = resolver.github_token(USER_ID).await.unwrap_err();
    assert!(matches!(err, CodingAgentError::Unauthorized(_)));
}

#[tokio::test]
async fn invalid_user_id_is_invalid_request() {
    let resolver = GithubLinkTokenResolver::new(StubLinkService {
        result: || Ok(GithubAccessToken::new("ghp_secret".to_owned())),
    });

    let err = resolver.github_token("not a valid id").await.unwrap_err();
    assert!(matches!(err, CodingAgentError::InvalidRequest(_)));
}
