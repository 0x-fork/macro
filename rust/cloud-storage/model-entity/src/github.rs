//! GitHub-related constants and utilities for foreign entities

use crate::NamespacedIdentifier;

/// GitHub namespace prefix
pub const GITHUB_NAMESPACE: &str = "github";

/// GitHub repository type
pub const GITHUB_REPO_TYPE: &str = "repo";

/// Creates a namespaced identifier for a GitHub repository
///
/// # Examples
///
/// ```
/// use model_entity::github::github_repo_id;
///
/// let ns_id = github_repo_id("octocat", "hello-world").unwrap();
/// assert_eq!(ns_id.to_string(), "github::repo:octocat/hello-world");
/// ```
pub fn github_repo_id(owner: &str, repo: &str) -> Result<NamespacedIdentifier, crate::NamespacedIdentifierError> {
    NamespacedIdentifier::new(
        vec![GITHUB_NAMESPACE.to_string(), GITHUB_REPO_TYPE.to_string()],
        format!("{}/{}", owner, repo),
    )
}

/// Parses a GitHub repository full name from a namespaced identifier
///
/// Returns (owner, repo) if the identifier is a valid GitHub repo ID
///
/// # Examples
///
/// ```
/// use model_entity::NamespacedIdentifier;
/// use model_entity::github::parse_github_repo_id;
///
/// let ns_id = NamespacedIdentifier::parse("github::repo:octocat/hello-world").unwrap();
/// let (owner, repo) = parse_github_repo_id(&ns_id).unwrap();
/// assert_eq!(owner, "octocat");
/// assert_eq!(repo, "hello-world");
/// ```
pub fn parse_github_repo_id(ns_id: &NamespacedIdentifier) -> Option<(String, String)> {
    let path = ns_id.path();

    // Check if it's a GitHub repo identifier
    if path.len() != 2 || path[0] != GITHUB_NAMESPACE || path[1] != GITHUB_REPO_TYPE {
        return None;
    }

    // Parse owner/repo from identifier
    let identifier = ns_id.identifier();
    let parts: Vec<&str> = identifier.splitn(2, '/').collect();

    if parts.len() != 2 {
        return None;
    }

    Some((parts[0].to_string(), parts[1].to_string()))
}

#[cfg(test)]
mod test;
