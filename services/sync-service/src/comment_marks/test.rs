use loro::{ExportMode, LoroDoc, LoroList, LoroMap, LoroMovableList, LoroText, ToJson};

use super::*;

fn text_node(id: &str, text: &str) -> LoroMap {
    let map = LoroMap::new();
    let meta = map.insert_container("$", LoroMap::new()).unwrap();
    meta.insert("type", "text").unwrap();
    meta.insert("id", id).unwrap();
    let t = map.insert_container("text", LoroText::new()).unwrap();
    t.insert(0, text).unwrap();
    map
}

fn mark_node(id: &str, thread_id: &str, children: Vec<LoroMap>) -> LoroMap {
    let map = LoroMap::new();
    let meta = map.insert_container("$", LoroMap::new()).unwrap();
    meta.insert("type", "comment-mark").unwrap();
    meta.insert("id", id).unwrap();
    let ids = map.insert_container("ids", LoroList::new()).unwrap();
    ids.push(thread_id).unwrap();
    let kids = map
        .insert_container("children", LoroMovableList::new())
        .unwrap();
    for c in children {
        kids.push_container(c).unwrap();
    }
    map
}

fn elem_node(type_name: &str, id: &str, children: Vec<LoroMap>) -> LoroMap {
    let map = LoroMap::new();
    let meta = map.insert_container("$", LoroMap::new()).unwrap();
    meta.insert("type", type_name).unwrap();
    meta.insert("id", id).unwrap();
    let kids = map
        .insert_container("children", LoroMovableList::new())
        .unwrap();
    for c in children {
        kids.push_container(c).unwrap();
    }
    map
}

/// Builds a root document with the given top-level children and returns its
/// exported snapshot bytes.
fn doc_snapshot(children: Vec<LoroMap>) -> Vec<u8> {
    let doc = LoroDoc::new();
    let root = doc.get_map(ROOT_CONTAINER);
    let meta = root.insert_container("$", LoroMap::new()).unwrap();
    meta.insert("type", "root").unwrap();
    let root_children = root
        .insert_container(CHILDREN_FIELD, LoroMovableList::new())
        .unwrap();
    for c in children {
        root_children.push_container(c).unwrap();
    }
    doc.export(ExportMode::Snapshot).unwrap()
}

fn deep_value_json(snapshot: &[u8]) -> String {
    let doc = LoroDoc::new();
    doc.import(snapshot).unwrap();
    doc.get_deep_value().to_json()
}

#[test]
fn strips_a_simple_comment_mark_keeping_its_text() {
    let snapshot = doc_snapshot(vec![elem_node(
        "paragraph",
        "para-1",
        vec![
            text_node("t-before", "before "),
            mark_node(
                "mark-1",
                "thread-1",
                vec![text_node("t-marked", "highlighted")],
            ),
            text_node("t-after", " after"),
        ],
    )]);

    let stripped = strip_orphaned_marks(&snapshot).expect("stripping should succeed");
    let json = deep_value_json(&stripped);

    assert!(
        !json.contains("comment-mark"),
        "expected no comment-mark node to remain: {json}"
    );
    assert!(
        json.contains("highlighted"),
        "text content should survive: {json}"
    );
    assert!(
        json.contains("before "),
        "surrounding text should survive: {json}"
    );
    assert!(
        json.contains(" after"),
        "surrounding text should survive: {json}"
    );
}

#[test]
fn strips_nested_overlapping_marks() {
    let inner = mark_node("mark-2", "thread-2", vec![text_node("t-double", "double")]);
    let outer = mark_node(
        "mark-1",
        "thread-1",
        vec![inner, text_node("t-single", "single")],
    );
    let snapshot = doc_snapshot(vec![elem_node(
        "paragraph",
        "para-1",
        vec![
            text_node("t-before", "before "),
            outer,
            text_node("t-after", " after"),
        ],
    )]);

    let stripped = strip_orphaned_marks(&snapshot).expect("stripping should succeed");
    let json = deep_value_json(&stripped);

    assert!(
        !json.contains("comment-mark"),
        "no marks should remain: {json}"
    );
    assert!(json.contains("double"));
    assert!(json.contains("single"));
    assert!(json.contains("before "));
    assert!(json.contains(" after"));
}

#[test]
fn removes_an_empty_mark_with_no_children() {
    let snapshot = doc_snapshot(vec![
        text_node("a", "A"),
        mark_node("mark-empty", "thread-x", vec![]),
        text_node("b", "B"),
    ]);

    let stripped = strip_orphaned_marks(&snapshot).expect("stripping should succeed");
    let json = deep_value_json(&stripped);

    assert!(!json.contains("comment-mark"), "{json}");
    assert!(json.contains('A'));
    assert!(json.contains('B'));
}

#[test]
fn leaves_a_document_with_no_marks_unchanged() {
    let snapshot = doc_snapshot(vec![elem_node(
        "paragraph",
        "para-1",
        vec![text_node("t1", "plain text, nothing to see here")],
    )]);

    let before = deep_value_json(&snapshot);
    let stripped = strip_orphaned_marks(&snapshot).expect("stripping should succeed");
    let after = deep_value_json(&stripped);

    assert_eq!(before, after);
}

#[test]
fn stripped_snapshot_round_trips_through_export_import() {
    let snapshot = doc_snapshot(vec![elem_node(
        "paragraph",
        "para-1",
        vec![
            text_node("t-before", "before "),
            mark_node(
                "mark-1",
                "thread-1",
                vec![text_node("t-marked", "highlighted")],
            ),
        ],
    )]);

    let stripped = strip_orphaned_marks(&snapshot).expect("stripping should succeed");

    // Re-import the stripped snapshot and export it again; the content
    // should be stable (no further changes, no corruption).
    let doc = LoroDoc::new();
    doc.import(&stripped).unwrap();
    let re_exported = doc.export(ExportMode::Snapshot).unwrap();

    assert_eq!(deep_value_json(&stripped), deep_value_json(&re_exported));
}
