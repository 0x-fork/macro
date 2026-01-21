use super::*;

#[test]
fn test_github_repo_id() {
    let ns_id = github_repo_id("octocat", "hello-world").unwrap();
    assert_eq!(ns_id.to_string(), "github::repo:octocat/hello-world");
    assert_eq!(ns_id.namespace(), "github");
    assert_eq!(ns_id.path(), &["github", "repo"]);
    assert_eq!(ns_id.identifier(), "octocat/hello-world");
}

#[test]
fn test_github_repo_id_with_special_chars() {
    let ns_id = github_repo_id("my-org", "my-repo_123").unwrap();
    assert_eq!(ns_id.to_string(), "github::repo:my-org/my-repo_123");
}

#[test]
fn test_parse_github_repo_id() {
    let ns_id = NamespacedIdentifier::parse("github::repo:octocat/hello-world").unwrap();
    let (owner, repo) = parse_github_repo_id(&ns_id).unwrap();
    assert_eq!(owner, "octocat");
    assert_eq!(repo, "hello-world");
}

#[test]
fn test_parse_github_repo_id_invalid_namespace() {
    let ns_id = NamespacedIdentifier::parse("discord::channel:123456").unwrap();
    assert!(parse_github_repo_id(&ns_id).is_none());
}

#[test]
fn test_parse_github_repo_id_invalid_format() {
    let ns_id = NamespacedIdentifier::parse("github::repo:invalid").unwrap();
    assert!(parse_github_repo_id(&ns_id).is_none());
}

#[test]
fn test_parse_github_repo_id_with_slashes() {
    // Handle edge case where repo name might contain extra slashes (though GitHub doesn't allow this)
    let ns_id = NamespacedIdentifier::parse("github::repo:owner/repo/extra").unwrap();
    let (owner, repo) = parse_github_repo_id(&ns_id).unwrap();
    assert_eq!(owner, "owner");
    assert_eq!(repo, "repo/extra");
}
