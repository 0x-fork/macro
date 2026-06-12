use super::*;

#[test]
fn typed_filters_expand_and_match() {
    let id = "0e2c2a8a-3f6e-4f3b-9a44-1f3b9b1f3b9b";
    let filter = SoupFilter::try_from_typed_filters(
        &format!(r#"{{"document_filters": {{"document_ids": ["{id}"]}}}}"#),
        None,
    )
    .unwrap();
    let item = format!(
        r#"{{"tag": "document", "data": {{"id": "{id}", "ownerId": "macro|u@x.com",
            "name": "d", "documentVersionId": 1,
            "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z",
            "viewedAt": null, "deletedAt": null, "properties": []}}}}"#
    );
    assert_eq!(filter.try_matches(&item, None), Ok(Verdict::Match));

    // Round-trip through the canonical AST JSON.
    let ast_json = filter.try_ast_json().unwrap();
    let reparsed = SoupFilter::try_from_ast(&ast_json, None).unwrap();
    assert_eq!(reparsed.try_matches(&item, None), Ok(Verdict::Match));
}

#[test]
fn matches_many_returns_one_code_per_item() {
    let filter =
        SoupFilter::try_from_typed_filters(r#"{"chat_filters": {"importance": false}}"#, None)
            .unwrap();
    let chat = r#"{"tag": "chat", "data": {"id": "0e2c2a8a-3f6e-4f3b-9a44-1f3b9b1f3b9b"}}"#;
    let doc = r#"{"tag": "document", "data": {"id": "0e2c2a8a-3f6e-4f3b-9a44-1f3b9b1f3b9b"}}"#;
    let out = filter
        .try_matches_many(&format!("[{chat},{doc}]"), None)
        .unwrap();
    assert_eq!(out, vec![Verdict::NoMatch as u8, Verdict::Match as u8]);
}

#[test]
fn notification_state_decides_done_filters() {
    let filter = SoupFilter::try_from_typed_filters(
        r#"{"document_filters": {"notification_filters": {"done": false}}}"#,
        None,
    )
    .unwrap();
    let doc = r#"{"tag": "document", "data": {"id": "0e2c2a8a-3f6e-4f3b-9a44-1f3b9b1f3b9b"}}"#;

    // Without state the literal is undecidable.
    assert_eq!(filter.try_matches(doc, None), Ok(Verdict::Unknown));
    // Caller asserts an undone notification exists -> matches.
    assert_eq!(
        filter.try_matches(doc, Some(r#"{"hasUndoneNotification": true}"#.into())),
        Ok(Verdict::Match)
    );
    // Per-item states in batch mode, with null for "don't know".
    let out = filter
        .try_matches_many(
            &format!("[{doc},{doc}]"),
            Some(r#"[{"hasUndoneNotification": false}, null]"#.into()),
        )
        .unwrap();
    assert_eq!(out, vec![Verdict::NoMatch as u8, Verdict::Unknown as u8]);
}

#[test]
fn options_enable_assignee_predicates() {
    let assignees_id = "00000001-0000-0000-0000-000000000001";
    let user = "macro|u@x.com";
    let filter = SoupFilter::try_from_typed_filters(
        r#"{"document_filters": {"importance": true}}"#,
        Some(format!(
            r#"{{"currentUserId": "{user}", "assigneesPropertyId": "{assignees_id}"}}"#
        )),
    )
    .unwrap();
    // A task assigned to the requester is "important".
    let assigned_task = format!(
        r#"{{"tag": "document", "data": {{
            "id": "0e2c2a8a-3f6e-4f3b-9a44-1f3b9b1f3b9b",
            "subType": {{"type": "task", "is_completed": false}},
            "properties": [{{
                "definition": {{"id": "{assignees_id}"}},
                "value": {{"type": "EntityReference", "value": [{{"entity_id": "{user}"}}]}}
            }}]
        }}}}"#
    );
    assert_eq!(filter.try_matches(&assigned_task, None), Ok(Verdict::Match));
}

#[test]
fn invalid_inputs_are_rejected() {
    assert!(SoupFilter::try_from_ast(r#"{"df": {"bogus": 1}}"#, None).is_err());
    assert!(
        SoupFilter::try_from_typed_filters(
            r#"{"document_filters": {"document_ids": ["nope"]}}"#,
            None
        )
        .is_err()
    );
    assert!(SoupFilter::try_from_ast("{}", Some("not json".into())).is_err());
    let filter = SoupFilter::try_from_ast("{}", None).unwrap();
    let doc = r#"{"tag": "document", "data": {}}"#;
    // Mismatched state array length is an error, not a silent guess.
    assert!(
        filter
            .try_matches_many(&format!("[{doc}]"), Some("[]".into()))
            .is_err()
    );
}
