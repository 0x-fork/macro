use super::*;

#[test]
fn extracts_user_and_document_mentions() {
    let content = r#"hey <m-user-mention>{"userId":"auth0|user-c"}</m-user-mention> see
<m-document-mention>{"documentId":"22222222-2222-2222-2222-222222222222","documentName":"Spec"}</m-document-mention>
and <m-user-mention>{"userId":"user-c@test.com"}</m-user-mention> again"#;
    assert_eq!(
        extract_mentions(content),
        vec![
            (
                "document".to_string(),
                "22222222-2222-2222-2222-222222222222".to_string()
            ),
            ("user".to_string(), "auth0|user-c".to_string()),
            ("user".to_string(), "user-c@test.com".to_string()),
        ]
    );
}

#[test]
fn malformed_payload_degrades_per_mention() {
    let content = r#"<m-user-mention>not json</m-user-mention> then <m-user-mention>{"userId":"auth0|ok"}</m-user-mention>"#;
    assert_eq!(
        extract_mentions(content),
        vec![("user".to_string(), "auth0|ok".to_string())]
    );
}

#[test]
fn plain_text_has_no_mentions() {
    assert!(extract_mentions("just some markdown **text**").is_empty());
}
