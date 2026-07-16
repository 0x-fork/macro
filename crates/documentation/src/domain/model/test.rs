use super::*;

fn page(id: u128, parent: Option<u128>, position: i32, path: &str) -> NavNode {
    NavNode {
        id: uuid::Uuid::from_u128(id),
        site_id: uuid::Uuid::from_u128(999),
        parent_id: parent.map(uuid::Uuid::from_u128),
        kind: NavNodeKind::Page,
        title: format!("Page {id}"),
        path: Some(PagePath::new(path).unwrap()),
        document_id: Some(format!("doc-{id}")),
        position,
    }
}

fn group(id: u128, parent: Option<u128>, position: i32) -> NavNode {
    NavNode {
        id: uuid::Uuid::from_u128(id),
        site_id: uuid::Uuid::from_u128(999),
        parent_id: parent.map(uuid::Uuid::from_u128),
        kind: NavNodeKind::Group,
        title: format!("Group {id}"),
        path: None,
        document_id: None,
        position,
    }
}

#[test]
fn site_slug_accepts_valid_slugs() {
    for slug in ["docs", "my-product-2", "a1", "0-0"] {
        assert!(SiteSlug::new(slug).is_ok(), "{slug} should be valid");
    }
}

#[test]
fn site_slug_rejects_invalid_slugs() {
    for slug in ["", "a", "-docs", "docs-", "Docs", "my docs", "a/b", "ü"] {
        assert!(
            matches!(SiteSlug::new(slug), Err(DocumentationError::InvalidSlug(_))),
            "{slug:?} should be invalid"
        );
    }
    let too_long = "a".repeat(64);
    assert!(SiteSlug::new(&too_long).is_err());
}

#[test]
fn site_slug_derives_from_name() {
    assert_eq!(
        SiteSlug::from_name("Macro Docs").unwrap().as_str(),
        "macro-docs"
    );
    assert_eq!(
        SiteSlug::from_name("  API — v2! ").unwrap().as_str(),
        "api-v2"
    );
    assert!(SiteSlug::from_name("!!!").is_none());
    assert!(SiteSlug::from_name("a").is_none());
}

#[test]
fn page_path_accepts_valid_paths() {
    for path in ["index", "getting-started", "product/email", "a/b/c", "v2"] {
        assert!(PagePath::new(path).is_ok(), "{path} should be valid");
    }
}

#[test]
fn page_path_rejects_invalid_paths() {
    for path in [
        "",
        "/leading",
        "trailing/",
        "double//slash",
        "UPPER",
        "spa ce",
        "-edge",
        "edge-",
        "a/-b",
    ] {
        assert!(
            matches!(PagePath::new(path), Err(DocumentationError::InvalidPath(_))),
            "{path:?} should be invalid"
        );
    }
    let too_deep = ["a"; 9].join("/");
    assert!(PagePath::new(&too_deep).is_err());
}

#[test]
fn page_path_derives_from_title() {
    assert_eq!(
        PagePath::from_title("Getting Started").unwrap().as_str(),
        "getting-started"
    );
    assert!(PagePath::from_title("!!!").is_none());
}

#[test]
fn custom_domain_validation() {
    assert!(CustomDomain::new("docs.macro.com").is_ok());
    assert!(CustomDomain::new("a-b.example.co").is_ok());
    for domain in [
        "",
        "nodot",
        ".leading.com",
        "trailing.com.",
        "UPPER.com",
        "spa ce.com",
    ] {
        assert!(
            matches!(
                CustomDomain::new(domain),
                Err(DocumentationError::InvalidDomain(_))
            ),
            "{domain:?} should be invalid"
        );
    }
}

#[test]
fn build_nav_tree_orders_and_nests() {
    let nodes = vec![
        page(2, None, 1, "second"),
        group(1, None, 0),
        page(11, Some(1), 1, "group/second-child"),
        page(10, Some(1), 0, "group/first-child"),
    ];

    let tree = build_nav_tree(nodes);
    assert_eq!(tree.len(), 2);
    assert_eq!(tree[0].node.id, uuid::Uuid::from_u128(1));
    assert_eq!(tree[0].children.len(), 2);
    assert_eq!(tree[0].children[0].node.id, uuid::Uuid::from_u128(10));
    assert_eq!(tree[0].children[1].node.id, uuid::Uuid::from_u128(11));
    assert_eq!(tree[1].node.id, uuid::Uuid::from_u128(2));
    assert!(tree[1].children.is_empty());
}

#[test]
fn build_nav_tree_lifts_orphans_to_top_level() {
    // Parent id 42 does not exist — the child must still appear.
    let nodes = vec![page(1, Some(42), 0, "orphan")];
    let tree = build_nav_tree(nodes);
    assert_eq!(tree.len(), 1);
    assert_eq!(tree[0].node.id, uuid::Uuid::from_u128(1));
}

#[test]
fn availability_requires_both_conditions() {
    assert!(
        DocumentationAvailability {
            plan_ok: true,
            enabled: true
        }
        .available()
    );
    assert!(
        !DocumentationAvailability {
            plan_ok: true,
            enabled: false
        }
        .available()
    );
    assert!(
        !DocumentationAvailability {
            plan_ok: false,
            enabled: true
        }
        .available()
    );
}
