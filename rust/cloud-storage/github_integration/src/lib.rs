//! GitHub integration library for Macro
//!
//! This crate provides GitHub OAuth integration, database operations for GitHub links,
//! and high-level service functions for linking/unlinking GitHub accounts.

pub mod config;
pub mod db;
pub mod error;
pub mod models;
pub mod oauth_client;
pub mod service;

// Re-export commonly used types
pub use config::GitHubConfig;
pub use error::{GitHubIntegrationError, Result};
pub use models::{
    GitHubCredentialsResponse, GitHubExchangeTokenResponse, GitHubLink, GitHubLinkInfo,
    GitHubRepository, GitHubUserInfo, OAuthState,
};
pub use oauth_client::GitHubOAuthClient;
pub use service::{
    get_github_credentials, get_user_repositories, link_github_account, unlink_github_account,
    FusionAuthLinking, IdentityProviderLink,
};
