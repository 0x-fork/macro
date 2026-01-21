use super::*;

#[test]
fn test_parse_simple_identifier() {
    let ns_id = NamespacedIdentifier::parse("discord::channel:842650710688399402").unwrap();
    assert_eq!(ns_id.path(), &["discord", "channel"]);
    assert_eq!(ns_id.identifier(), "842650710688399402");
    assert_eq!(ns_id.namespace(), "discord");
}

#[test]
fn test_parse_github_user() {
    let ns_id = NamespacedIdentifier::parse("github::user:roobscoob").unwrap();
    assert_eq!(ns_id.path(), &["github", "user"]);
    assert_eq!(ns_id.identifier(), "roobscoob");
}

#[test]
fn test_parse_complex_path() {
    let ns_id = NamespacedIdentifier::parse("github::repo::branch:macro-inc/macro#main").unwrap();
    assert_eq!(ns_id.path(), &["github", "repo", "branch"]);
    assert_eq!(ns_id.identifier(), "macro-inc/macro#main");
}

#[test]
fn test_parse_identifier_with_colons() {
    // Identifier can contain colons - only the LAST colon separates path from identifier
    let ns_id = NamespacedIdentifier::parse("service::type:some:identifier:with:colons").unwrap();
    assert_eq!(ns_id.path(), &["service", "type"]);
    assert_eq!(ns_id.identifier(), "some:identifier:with:colons");
}

#[test]
fn test_parse_special_characters_in_identifier() {
    let test_cases = vec![
        ("discord::channel:123#456", "123#456"),
        ("github::repo:owner/repo", "owner/repo"),
        ("service::entity:id-with-dashes", "id-with-dashes"),
        ("service::entity:id_with_underscores", "id_with_underscores"),
        ("service::entity:id@example.com", "id@example.com"),
        ("service::entity:id+tag", "id+tag"),
    ];

    for (input, expected_id) in test_cases {
        let ns_id = NamespacedIdentifier::parse(input).unwrap();
        assert_eq!(ns_id.identifier(), expected_id);
    }
}

#[test]
fn test_parse_unicode() {
    let ns_id = NamespacedIdentifier::parse("service::user:用户123").unwrap();
    assert_eq!(ns_id.identifier(), "用户123");
}

#[test]
fn test_display() {
    let ns_id = NamespacedIdentifier::parse("discord::channel:842650710688399402").unwrap();
    assert_eq!(ns_id.to_string(), "discord::channel:842650710688399402");

    let ns_id = NamespacedIdentifier::parse("github::repo::branch:macro-inc/macro#main").unwrap();
    assert_eq!(
        ns_id.to_string(),
        "github::repo::branch:macro-inc/macro#main"
    );
}

#[test]
fn test_roundtrip_parse_display() {
    let inputs = vec![
        "discord::channel:842650710688399402",
        "github::user:roobscoob",
        "github::repo::branch:macro-inc/macro#main",
        "service::type:complex:id:with:colons",
    ];

    for input in inputs {
        let ns_id = NamespacedIdentifier::parse(input).unwrap();
        assert_eq!(ns_id.to_string(), input);
    }
}

#[test]
fn test_new_from_parts() {
    let ns_id = NamespacedIdentifier::new(
        vec!["discord".to_string(), "channel".to_string()],
        "842650710688399402".to_string(),
    )
    .unwrap();

    assert_eq!(ns_id.path(), &["discord", "channel"]);
    assert_eq!(ns_id.identifier(), "842650710688399402");
}

#[test]
fn test_into_parts() {
    let ns_id = NamespacedIdentifier::parse("discord::channel:123").unwrap();
    let (path, identifier) = ns_id.into_parts();

    assert_eq!(path, vec!["discord".to_string(), "channel".to_string()]);
    assert_eq!(identifier, "123");
}

#[test]
fn test_error_empty_input() {
    let result = NamespacedIdentifier::parse("");
    assert_eq!(result, Err(NamespacedIdentifierError::EmptyInput));
}

#[test]
fn test_error_missing_identifier() {
    let result = NamespacedIdentifier::parse("discord::channel");
    assert_eq!(result, Err(NamespacedIdentifierError::MissingIdentifier));
}

#[test]
fn test_error_empty_identifier() {
    let result = NamespacedIdentifier::parse("discord::channel:");
    assert_eq!(result, Err(NamespacedIdentifierError::EmptyIdentifier));
}

#[test]
fn test_error_empty_path() {
    let result = NamespacedIdentifier::parse(":identifier");
    assert_eq!(result, Err(NamespacedIdentifierError::EmptyPathSegment));
}

#[test]
fn test_error_empty_path_segment() {
    let result = NamespacedIdentifier::parse("discord:::123");
    assert_eq!(result, Err(NamespacedIdentifierError::EmptyPathSegment));

    let result = NamespacedIdentifier::parse("::channel:123");
    assert_eq!(result, Err(NamespacedIdentifierError::EmptyPathSegment));
}

#[test]
fn test_error_invalid_path_segment_with_colon() {
    let result = NamespacedIdentifier::parse("discord:invalid::channel:123");
    assert!(matches!(
        result,
        Err(NamespacedIdentifierError::InvalidPathSegment(_))
    ));
}

#[test]
fn test_serialization() {
    let ns_id = NamespacedIdentifier::parse("discord::channel:123").unwrap();
    let json = serde_json::to_string(&ns_id).unwrap();
    let deserialized: NamespacedIdentifier = serde_json::from_str(&json).unwrap();
    assert_eq!(ns_id, deserialized);
}

#[test]
fn test_from_str() {
    let ns_id: NamespacedIdentifier = "discord::channel:123".parse().unwrap();
    assert_eq!(ns_id.path(), &["discord", "channel"]);
    assert_eq!(ns_id.identifier(), "123");
}

#[test]
fn test_single_segment_path() {
    let ns_id = NamespacedIdentifier::parse("discord:123").unwrap();
    assert_eq!(ns_id.path(), &["discord"]);
    assert_eq!(ns_id.identifier(), "123");
    assert_eq!(ns_id.namespace(), "discord");
}

#[test]
fn test_very_long_path() {
    let path_segments: Vec<String> = (0..100).map(|i| format!("segment{}", i)).collect();
    let ns_id = NamespacedIdentifier::new(path_segments.clone(), "identifier".to_string()).unwrap();
    assert_eq!(ns_id.path(), path_segments.as_slice());
}

#[test]
fn test_very_long_identifier() {
    let long_id = "a".repeat(10_000);
    let input = format!("service::type:{}", long_id);
    let ns_id = NamespacedIdentifier::parse(&input).unwrap();
    assert_eq!(ns_id.identifier(), long_id);
}

#[test]
fn test_hash_and_eq() {
    use std::collections::HashSet;

    let ns_id1 = NamespacedIdentifier::parse("discord::channel:123").unwrap();
    let ns_id2 = NamespacedIdentifier::parse("discord::channel:123").unwrap();
    let ns_id3 = NamespacedIdentifier::parse("discord::channel:456").unwrap();

    assert_eq!(ns_id1, ns_id2);
    assert_ne!(ns_id1, ns_id3);

    let mut set = HashSet::new();
    set.insert(ns_id1.clone());
    assert!(set.contains(&ns_id2));
    assert!(!set.contains(&ns_id3));
}
