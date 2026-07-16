//! Renders a small sample documentation site to a local directory so the
//! default theme can be eyeballed without running the full stack:
//!
//! ```sh
//! cargo run -p documentation --example render_sample_site -- /tmp/sample-site
//! ```

use std::collections::BTreeMap;

use documentation::domain::{
    model::{NavNode, NavNodeKind, NavTreeNode, PagePath},
    ssg::{RenderSiteInput, render_site},
};

fn page(id: u128, parent: Option<u128>, title: &str, path: &str) -> NavTreeNode {
    NavTreeNode {
        node: NavNode {
            id: uuid::Uuid::from_u128(id),
            site_id: uuid::Uuid::from_u128(1),
            parent_id: parent.map(uuid::Uuid::from_u128),
            kind: NavNodeKind::Page,
            title: title.to_string(),
            path: Some(PagePath::new(path).expect("valid path")),
            document_id: Some(format!("doc-{id}")),
            position: 0,
        },
        children: Vec::new(),
    }
}

fn group(id: u128, title: &str, children: Vec<NavTreeNode>) -> NavTreeNode {
    NavTreeNode {
        node: NavNode {
            id: uuid::Uuid::from_u128(id),
            site_id: uuid::Uuid::from_u128(1),
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

fn main() -> anyhow::Result<()> {
    let out_dir = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "sample-site".to_string());

    let mut page_markdown = BTreeMap::new();
    page_markdown.insert(
        uuid::Uuid::from_u128(1),
        include_str!("sample/welcome.md").to_string(),
    );
    page_markdown.insert(
        uuid::Uuid::from_u128(2),
        include_str!("sample/getting-started.md").to_string(),
    );
    page_markdown.insert(
        uuid::Uuid::from_u128(3),
        include_str!("sample/email.md").to_string(),
    );

    let input = RenderSiteInput {
        site_name: "Macro Docs".to_string(),
        public_base_url: "https://docs-sites.macro.com/macro".to_string(),
        nav: vec![
            page(1, None, "Welcome to Macro", "index"),
            page(2, None, "Get Started", "getting-started"),
            group(
                9,
                "Blocks",
                vec![page(3, Some(9), "Email", "product/email")],
            ),
        ],
        page_markdown,
    };

    let files = render_site(&input)?;
    for file in &files {
        let path = std::path::Path::new(&out_dir).join(&file.path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, &file.content)?;
        println!("wrote {}", path.display());
    }

    Ok(())
}
