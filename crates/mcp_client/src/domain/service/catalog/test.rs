use super::*;
use std::sync::Mutex;

/// Fake registry returning a canned page and recording the query it got.
struct FakeRegistry {
    page: CatalogPage,
    seen: Mutex<Vec<(Option<String>, Option<String>, u32)>>,
}

impl FakeRegistry {
    fn returning(entries: Vec<CatalogEntry>) -> Self {
        Self {
            page: CatalogPage {
                entries,
                next_cursor: None,
            },
            seen: Mutex::new(Vec::new()),
        }
    }
}

impl McpRegistry for FakeRegistry {
    async fn search(
        &self,
        search: Option<&str>,
        cursor: Option<&str>,
        limit: u32,
    ) -> anyhow::Result<CatalogPage> {
        self.seen.lock().unwrap().push((
            search.map(str::to_owned),
            cursor.map(str::to_owned),
            limit,
        ));
        Ok(self.page.clone())
    }
}

fn registry_entry(name: &str, url: &str) -> CatalogEntry {
    CatalogEntry {
        name: name.to_owned(),
        display_name: name.to_owned(),
        description: Some("from the registry".to_owned()),
        url: url.to_owned(),
        icon_url: None,
        priority: false,
    }
}

#[tokio::test]
async fn first_page_pins_priority_connectors_before_registry_results() {
    let registry = FakeRegistry::returning(vec![registry_entry(
        "io.github.someone/thing",
        "https://example.com/mcp",
    )]);

    let page = browse_catalog(&registry, None, None, None).await.unwrap();

    let split = page.entries.iter().position(|e| !e.priority).unwrap();
    assert_eq!(split, PRIORITY_CONNECTORS.len());
    assert!(page.entries[..split].iter().all(|e| e.priority));
    assert_eq!(page.entries[split].name, "io.github.someone/thing");
}

#[tokio::test]
async fn registry_duplicates_of_priority_connectors_are_dropped() {
    // Same server as the Linear priority connector, with a trailing slash.
    let registry = FakeRegistry::returning(vec![
        registry_entry("app.linear/linear", "https://mcp.linear.app/mcp/"),
        registry_entry("io.github.someone/thing", "https://example.com/mcp"),
    ]);

    let page = browse_catalog(&registry, None, None, None).await.unwrap();

    let linear: Vec<_> = page
        .entries
        .iter()
        .filter(|e| e.display_name.eq_ignore_ascii_case("linear"))
        .collect();
    assert_eq!(linear.len(), 1, "Linear must appear exactly once");
    assert!(linear[0].priority);
}

#[tokio::test]
async fn search_filters_priority_connectors_and_marks_them() {
    let registry = FakeRegistry::returning(vec![registry_entry(
        "io.github.evozim/linear-broker",
        "https://linear-broker.example.com/mcp",
    )]);

    let page = browse_catalog(&registry, Some("linear"), None, None)
        .await
        .unwrap();

    assert_eq!(page.entries[0].display_name, "Linear");
    assert!(page.entries[0].priority);
    // Non-matching priority connectors (Notion, Slack, ...) stay out.
    assert_eq!(
        page.entries.iter().filter(|e| e.priority).count(),
        1,
        "only the matching priority connector is pinned"
    );
    assert_eq!(page.entries[1].name, "io.github.evozim/linear-broker");
}

#[tokio::test]
async fn later_pages_never_repeat_priority_connectors() {
    let registry = FakeRegistry::returning(vec![registry_entry(
        "app.linear/linear",
        "https://mcp.linear.app/mcp",
    )]);

    let page = browse_catalog(&registry, None, Some("cursor-1"), None)
        .await
        .unwrap();

    assert!(
        page.entries.is_empty(),
        "priority connectors are neither pinned nor repeated on later pages"
    );
}

#[tokio::test]
async fn blank_search_browses_and_limit_is_clamped() {
    let registry = FakeRegistry::returning(vec![]);

    browse_catalog(&registry, Some("   "), None, Some(9999))
        .await
        .unwrap();

    let seen = registry.seen.lock().unwrap();
    let (search, cursor, limit) = seen[0].clone();
    assert_eq!(search, None, "whitespace-only search means browse");
    assert_eq!(cursor, None);
    assert_eq!(limit, MAX_PAGE_SIZE);
}

#[tokio::test]
async fn priority_taglines_override_registry_descriptions() {
    let registry = FakeRegistry::returning(vec![]);

    let page = browse_catalog(&registry, Some("notion"), None, None)
        .await
        .unwrap();

    assert_eq!(
        page.entries[0].description.as_deref(),
        Some("Search your pages, databases, and wikis.")
    );
}
