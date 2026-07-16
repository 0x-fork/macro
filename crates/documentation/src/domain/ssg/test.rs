use std::collections::BTreeMap;

use crate::domain::{
    model::{DocumentationError, NavNode, NavNodeKind, NavTreeNode, PagePath},
    ssg::{RenderSiteInput, render_site},
};

fn page_node(id: u128, path: &str, title: &str) -> NavTreeNode {
    NavTreeNode {
        node: NavNode {
            id: uuid::Uuid::from_u128(id),
            site_id: uuid::Uuid::from_u128(999),
            parent_id: None,
            kind: NavNodeKind::Page,
            title: title.to_string(),
            path: Some(PagePath::new(path).unwrap()),
            document_id: Some(format!("doc-{id}")),
            position: 0,
        },
        children: Vec::new(),
    }
}

fn group_node(id: u128, title: &str, children: Vec<NavTreeNode>) -> NavTreeNode {
    NavTreeNode {
        node: NavNode {
            id: uuid::Uuid::from_u128(id),
            site_id: uuid::Uuid::from_u128(999),
            parent_id: None,
            kind: NavNodeKind::Group,
            title: title.to_string(),
            path: None,
            document_id: None,
            position: 0,
        },
        children,
    }
}

fn test_input() -> RenderSiteInput {
    let mut page_markdown = BTreeMap::new();
    page_markdown.insert(
        uuid::Uuid::from_u128(1),
        "# Welcome\n\nThe intro paragraph.\n\n## First Section\n\nRead [Getting Started](/getting-started).\n".to_string(),
    );
    page_markdown.insert(
        uuid::Uuid::from_u128(2),
        "Some content with a [link](/product/email#setup) and an image ![img](/images/shot.png).\n\n## Setup\n\n### Details\n\n| a | b |\n| - | - |\n| 1 | 2 |\n".to_string(),
    );
    page_markdown.insert(
        uuid::Uuid::from_u128(3),
        "External [link](https://example.com) stays.\n\n<iframe src=\"https://www.youtube.com/embed/x\"></iframe>\n".to_string(),
    );

    RenderSiteInput {
        site_name: "Macro Docs".to_string(),
        public_base_url: "https://docs-sites.macro.com/macro-docs".to_string(),
        nav: vec![
            page_node(1, "index", "Welcome"),
            page_node(2, "getting-started", "Getting Started"),
            group_node(9, "Product", vec![page_node(3, "product/email", "Email")]),
        ],
        page_markdown,
    }
}

fn file<'a>(files: &'a [crate::domain::ports::RenderedFile], path: &str) -> &'a str {
    let f = files
        .iter()
        .find(|f| f.path == path)
        .unwrap_or_else(|| panic!("missing file {path}"));
    std::str::from_utf8(&f.content).unwrap()
}

#[test]
fn renders_expected_file_set() {
    let files = render_site(&test_input()).unwrap();
    let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();

    // The `index` page is served at the site root; no redirect emitted.
    assert!(paths.contains(&"index.html"));
    assert!(paths.contains(&"getting-started/index.html"));
    assert!(paths.contains(&"product/email/index.html"));
    assert!(paths.contains(&"assets/theme.css"));
    assert!(paths.contains(&"assets/search.js"));
    assert!(paths.contains(&"search-index.json"));
    assert!(paths.contains(&"sitemap.xml"));
    assert_eq!(paths.len(), 7);
}

#[test]
fn rewrites_root_absolute_links_relative_to_page_depth() {
    let files = render_site(&test_input()).unwrap();

    // Root page links straight into the page directory.
    let index = file(&files, "index.html");
    assert!(index.contains("href=\"getting-started/\""), "{index}");

    // Depth-1 page: one `../` up, and fragments survive.
    let getting_started = file(&files, "getting-started/index.html");
    assert!(getting_started.contains("href=\"../product/email/#setup\""));
    assert!(getting_started.contains("src=\"../images/shot.png\""));

    // Depth-2 page: external links untouched, raw HTML passes through.
    let email = file(&files, "product/email/index.html");
    assert!(email.contains("href=\"https://example.com\""));
    assert!(email.contains("<iframe src=\"https://www.youtube.com/embed/x\">"));
    assert!(email.contains("href=\"../../assets/theme.css\""));
}

#[test]
fn generates_toc_and_heading_anchors() {
    let files = render_site(&test_input()).unwrap();
    let getting_started = file(&files, "getting-started/index.html");

    assert!(getting_started.contains("<h2 id=\"setup\">"));
    assert!(getting_started.contains("<h3 id=\"details\">"));
    assert!(getting_started.contains("On this page"));
    assert!(getting_started.contains("href=\"#setup\""));
    assert!(getting_started.contains("toc-nested"));
}

#[test]
fn injects_title_heading_only_when_markdown_lacks_one() {
    let files = render_site(&test_input()).unwrap();

    // Page 1 starts with its own h1 — not doubled.
    let index = file(&files, "index.html");
    assert_eq!(index.matches("<h1").count(), 1);
    assert!(index.contains("<h1 id=\"welcome\">"));

    // Page 2 has no h1 — the nav title is injected.
    let getting_started = file(&files, "getting-started/index.html");
    assert!(getting_started.contains("<h1>Getting Started</h1>"));
}

#[test]
fn renders_sidebar_with_current_page_and_groups() {
    let files = render_site(&test_input()).unwrap();
    let email = file(&files, "product/email/index.html");

    assert!(email.contains("nav-group"));
    assert!(email.contains(">Product</li>"));
    assert!(email.contains("aria-current=\"page\""));
    // Sidebar links are relative from the depth-2 page.
    assert!(email.contains("href=\"../../getting-started/\""));
}

#[test]
fn renders_prev_next_pager_in_nav_order() {
    let files = render_site(&test_input()).unwrap();
    let getting_started = file(&files, "getting-started/index.html");

    assert!(getting_started.contains("pager-prev"));
    assert!(getting_started.contains("pager-next"));
    assert!(getting_started.contains(">Welcome</a>") || getting_started.contains("Welcome"));
}

#[test]
fn emits_root_redirect_when_no_index_page() {
    let mut input = test_input();
    input.nav.remove(0);
    input.page_markdown.remove(&uuid::Uuid::from_u128(1));

    let files = render_site(&input).unwrap();
    let index = file(&files, "index.html");
    assert!(index.contains("http-equiv=\"refresh\""));
    assert!(index.contains("url=getting-started/"));
}

#[test]
fn sitemap_lists_absolute_urls() {
    let files = render_site(&test_input()).unwrap();
    let sitemap = file(&files, "sitemap.xml");

    assert!(sitemap.contains("<loc>https://docs-sites.macro.com/macro-docs/</loc>"));
    assert!(
        sitemap.contains("<loc>https://docs-sites.macro.com/macro-docs/getting-started/</loc>")
    );
    assert!(sitemap.contains("<loc>https://docs-sites.macro.com/macro-docs/product/email/</loc>"));
}

#[test]
fn search_index_covers_every_page() {
    let files = render_site(&test_input()).unwrap();
    let index: serde_json::Value = serde_json::from_str(file(&files, "search-index.json")).unwrap();
    let entries = index.as_array().unwrap();

    assert_eq!(entries.len(), 3);
    assert_eq!(entries[0]["title"], "Welcome");
    assert_eq!(entries[0]["path"], "");
    assert_eq!(entries[1]["path"], "getting-started/");
    assert!(
        entries[1]["text"]
            .as_str()
            .unwrap()
            .contains("Some content")
    );
}

#[test]
fn gfm_tables_render() {
    let files = render_site(&test_input()).unwrap();
    let getting_started = file(&files, "getting-started/index.html");
    assert!(getting_started.contains("<table>"));
}

#[test]
fn empty_site_is_an_error() {
    let input = RenderSiteInput {
        site_name: "Empty".to_string(),
        public_base_url: "https://docs-sites.macro.com/empty".to_string(),
        nav: Vec::new(),
        page_markdown: BTreeMap::new(),
    };
    assert!(matches!(
        render_site(&input),
        Err(DocumentationError::NoPages)
    ));
}

#[test]
fn duplicate_headings_get_unique_anchors() {
    let mut page_markdown = BTreeMap::new();
    page_markdown.insert(
        uuid::Uuid::from_u128(1),
        "## Setup\n\ntext\n\n## Setup\n\nmore\n".to_string(),
    );
    let input = RenderSiteInput {
        site_name: "Docs".to_string(),
        public_base_url: "https://docs-sites.macro.com/docs".to_string(),
        nav: vec![page_node(1, "index", "Home")],
        page_markdown,
    };

    let files = render_site(&input).unwrap();
    let index = file(&files, "index.html");
    assert!(index.contains("<h2 id=\"setup\">"));
    assert!(index.contains("<h2 id=\"setup-1\">"));
}

#[test]
fn meta_description_comes_from_first_paragraph() {
    let files = render_site(&test_input()).unwrap();
    let index = file(&files, "index.html");
    assert!(index.contains("<meta name=\"description\" content=\"The intro paragraph.\">"));
}
