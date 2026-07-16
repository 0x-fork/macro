//! Renders a documentation site to static files.

use std::collections::BTreeMap;

use askama::Template;
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

use crate::domain::{
    model::{DocumentationError, NavNodeKind, NavTreeNode, PagePath},
    ports::RenderedFile,
    ssg::templates::{NavEntry, PageLink, PageTemplate, RedirectTemplate, TocEntry},
};

/// The default theme stylesheet, inlined into the published site.
const THEME_CSS: &str = include_str!("theme.css");
/// The client-side search script, inlined into the published site.
const SEARCH_JS: &str = include_str!("search.js");
/// The page path served at the site root.
const INDEX_PATH: &str = "index";
/// Maximum characters of page text stored per page in the search index.
const SEARCH_TEXT_MAX_LEN: usize = 2000;
/// Maximum characters of the derived meta description.
const DESCRIPTION_MAX_LEN: usize = 160;

/// One publishable page: a nav-tree page node joined with its markdown.
#[derive(Debug, Clone)]
pub struct SitePage {
    /// The page's URL path under the site root.
    pub path: PagePath,
    /// The page's nav title.
    pub title: String,
    /// The page's markdown content.
    pub markdown: String,
}

/// Everything the renderer needs to build a site.
#[derive(Debug, Clone)]
pub struct RenderSiteInput {
    /// The site's display name (topbar brand).
    pub site_name: String,
    /// Absolute base URL the site will be served from (no trailing slash),
    /// used only for absolute-URL artifacts like the sitemap.
    pub public_base_url: String,
    /// The site's nav tree (groups and pages, ordered).
    pub nav: Vec<NavTreeNode>,
    /// Markdown for every page node in `nav`, keyed by nav node id.
    pub page_markdown: BTreeMap<uuid::Uuid, String>,
}

/// Renders the complete static site.
pub fn render_site(input: &RenderSiteInput) -> Result<Vec<RenderedFile>, DocumentationError> {
    let pages = collect_pages(&input.nav, &input.page_markdown);
    if pages.is_empty() {
        return Err(DocumentationError::NoPages);
    }

    let mut files = Vec::with_capacity(pages.len() + 4);
    let mut search_entries = Vec::with_capacity(pages.len());

    for (i, page) in pages.iter().enumerate() {
        let depth = page_depth(&page.path);
        let root_prefix = "../".repeat(depth);

        let rendered = render_markdown(&page.markdown, &root_prefix);
        let sidebar = render_sidebar(&input.nav, Some(page.path.as_str()), &root_prefix);

        let prev = (i > 0).then(|| page_link(&pages[i - 1], &root_prefix));
        let next = (i + 1 < pages.len()).then(|| page_link(&pages[i + 1], &root_prefix));

        let template = PageTemplate {
            site_name: &input.site_name,
            page_title: &page.title,
            description: &rendered.description,
            root_prefix: &root_prefix,
            has_leading_heading: rendered.has_leading_heading,
            content_html: &rendered.html,
            sidebar,
            toc: rendered.toc,
            prev,
            next,
        };
        let html = template
            .render()
            .map_err(|e| DocumentationError::Internal(rootcause::report!("{e}")))?;

        files.push(RenderedFile {
            path: page_file_path(&page.path),
            content_type: "text/html; charset=utf-8",
            content: html.into_bytes(),
        });

        search_entries.push(serde_json::json!({
            "title": page.title,
            "path": page_href_from_root(&page.path),
            "text": rendered.search_text,
        }));
    }

    // Without an `index` page the site root redirects to the first page.
    if !pages.iter().any(|p| p.path.as_str() == INDEX_PATH) {
        let target = page_href_from_root(&pages[0].path);
        let redirect = RedirectTemplate { target: &target }
            .render()
            .map_err(|e| DocumentationError::Internal(rootcause::report!("{e}")))?;
        files.push(RenderedFile {
            path: "index.html".to_string(),
            content_type: "text/html; charset=utf-8",
            content: redirect.into_bytes(),
        });
    }

    files.push(RenderedFile {
        path: "assets/theme.css".to_string(),
        content_type: "text/css; charset=utf-8",
        content: THEME_CSS.as_bytes().to_vec(),
    });
    files.push(RenderedFile {
        path: "assets/search.js".to_string(),
        content_type: "text/javascript; charset=utf-8",
        content: SEARCH_JS.as_bytes().to_vec(),
    });
    files.push(RenderedFile {
        path: "search-index.json".to_string(),
        content_type: "application/json",
        content: serde_json::to_vec(&search_entries)
            .map_err(|e| DocumentationError::Internal(rootcause::report!("{e}")))?,
    });
    files.push(RenderedFile {
        path: "sitemap.xml".to_string(),
        content_type: "application/xml",
        content: render_sitemap(&input.public_base_url, &pages).into_bytes(),
    });

    Ok(files)
}

/// Flattens the nav tree into publish order (depth-first), keeping only
/// page nodes that have markdown.
fn collect_pages(
    nav: &[NavTreeNode],
    page_markdown: &BTreeMap<uuid::Uuid, String>,
) -> Vec<SitePage> {
    let mut pages = Vec::new();
    collect_pages_into(nav, page_markdown, &mut pages);
    pages
}

fn collect_pages_into(
    nodes: &[NavTreeNode],
    page_markdown: &BTreeMap<uuid::Uuid, String>,
    out: &mut Vec<SitePage>,
) {
    for node in nodes {
        if node.node.kind == NavNodeKind::Page
            && let (Some(path), Some(markdown)) =
                (node.node.path.as_ref(), page_markdown.get(&node.node.id))
        {
            out.push(SitePage {
                path: path.clone(),
                title: node.node.title.clone(),
                markdown: markdown.clone(),
            });
        }
        collect_pages_into(&node.children, page_markdown, out);
    }
}

/// Directory depth of a page's emitted HTML file below the site root.
fn page_depth(path: &PagePath) -> usize {
    if path.as_str() == INDEX_PATH {
        0
    } else {
        path.depth()
    }
}

/// Where a page's HTML file lives relative to the site root.
fn page_file_path(path: &PagePath) -> String {
    if path.as_str() == INDEX_PATH {
        "index.html".to_string()
    } else {
        format!("{path}/index.html")
    }
}

/// A page's href relative to the site root (pretty URL, trailing slash).
fn page_href_from_root(path: &PagePath) -> String {
    if path.as_str() == INDEX_PATH {
        String::new()
    } else {
        format!("{path}/")
    }
}

/// A page's href relative to another page's `root_prefix`. An empty
/// relative href (link to the root page from the root page) is normalized
/// to `./` so the anchor stays valid.
fn page_href(path: &PagePath, root_prefix: &str) -> String {
    let href = format!("{root_prefix}{}", page_href_from_root(path));
    if href.is_empty() {
        "./".to_string()
    } else {
        href
    }
}

fn page_link(page: &SitePage, root_prefix: &str) -> PageLink {
    PageLink {
        title: page.title.clone(),
        href: page_href(&page.path, root_prefix),
    }
}

/// Output of rendering one page's markdown.
struct RenderedMarkdown {
    html: String,
    toc: Vec<TocEntry>,
    search_text: String,
    description: String,
    /// Whether the markdown itself starts with an `<h1>` (in which case the
    /// template must not inject the nav title as a heading).
    has_leading_heading: bool,
}

/// Renders GitHub-flavored markdown to HTML with heading anchors, a
/// table-of-contents, and site-root-absolute link rewriting.
fn render_markdown(markdown: &str, root_prefix: &str) -> RenderedMarkdown {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_FOOTNOTES);

    let parser = Parser::new_ext(markdown, options);

    let mut events: Vec<Event> = Vec::new();
    let mut toc: Vec<TocEntry> = Vec::new();
    let mut search_text = String::new();
    let mut description = String::new();

    let mut heading: Option<(HeadingLevel, String)> = None;
    let mut heading_start: usize = 0;
    let mut seen_ids: BTreeMap<String, usize> = BTreeMap::new();
    let mut first_block_is_h1 = false;
    let mut seen_any_block = false;
    let mut in_first_paragraph = false;

    for event in parser {
        match &event {
            Event::Start(Tag::Heading { level, .. }) => {
                if !seen_any_block {
                    seen_any_block = true;
                    first_block_is_h1 = *level == HeadingLevel::H1;
                }
                heading = Some((*level, String::new()));
                heading_start = events.len();
            }
            Event::End(TagEnd::Heading(_)) => {
                if let Some((level, text)) = heading.take() {
                    let id = unique_heading_id(&text, &mut seen_ids);
                    // Re-emit the heading start with the anchor id attached.
                    if let Some(Event::Start(Tag::Heading {
                        level: l,
                        classes,
                        attrs,
                        ..
                    })) = events.get(heading_start).cloned()
                    {
                        events[heading_start] = Event::Start(Tag::Heading {
                            level: l,
                            id: Some(id.clone().into()),
                            classes,
                            attrs,
                        });
                    }
                    if matches!(level, HeadingLevel::H2 | HeadingLevel::H3) {
                        toc.push(TocEntry {
                            title: text,
                            anchor: id,
                            nested: level == HeadingLevel::H3,
                        });
                    }
                }
            }
            Event::Start(Tag::Paragraph) => {
                if !seen_any_block {
                    seen_any_block = true;
                }
                if description.is_empty() {
                    in_first_paragraph = true;
                }
            }
            Event::End(TagEnd::Paragraph) => {
                in_first_paragraph = false;
            }
            Event::Start(tag) => {
                if !seen_any_block
                    && !matches!(tag, Tag::Heading { .. } | Tag::Paragraph | Tag::HtmlBlock)
                {
                    seen_any_block = true;
                }
            }
            Event::Text(text) | Event::Code(text) => {
                if let Some((_, buffer)) = heading.as_mut() {
                    buffer.push_str(text);
                }
                if in_first_paragraph && description.len() < DESCRIPTION_MAX_LEN {
                    description.push_str(text);
                }
                if search_text.len() < SEARCH_TEXT_MAX_LEN {
                    search_text.push_str(text);
                    search_text.push(' ');
                }
            }
            _ => {}
        }

        // Rewrite site-root-absolute links/images to page-relative ones so
        // the site works from any base path (shared host or custom domain).
        let event = match event {
            Event::Start(Tag::Link {
                link_type,
                dest_url,
                title,
                id,
            }) => Event::Start(Tag::Link {
                link_type,
                dest_url: rewrite_url(&dest_url, root_prefix).into(),
                title,
                id,
            }),
            Event::Start(Tag::Image {
                link_type,
                dest_url,
                title,
                id,
            }) => Event::Start(Tag::Image {
                link_type,
                dest_url: rewrite_url(&dest_url, root_prefix).into(),
                title,
                id,
            }),
            other => other,
        };

        events.push(event);
    }

    let mut html = String::with_capacity(markdown.len() * 3 / 2);
    pulldown_cmark::html::push_html(&mut html, events.into_iter());

    let mut description = description.trim().to_string();
    description.truncate(DESCRIPTION_MAX_LEN);

    RenderedMarkdown {
        html,
        toc,
        search_text: search_text.trim().to_string(),
        description,
        has_leading_heading: first_block_is_h1,
    }
}

/// Rewrites a site-root-absolute URL (`/getting-started#setup`) to a
/// page-relative one. External URLs, anchors, and already-relative URLs
/// pass through unchanged.
fn rewrite_url(url: &str, root_prefix: &str) -> String {
    let Some(rest) = url.strip_prefix('/') else {
        return url.to_string();
    };
    // Protocol-relative URLs (`//example.com/x`) are external.
    if rest.starts_with('/') {
        return url.to_string();
    }
    let (path, suffix) = match rest.find(['#', '?']) {
        Some(idx) => rest.split_at(idx),
        None => (rest, ""),
    };
    let path = path.trim_end_matches('/');
    if path.is_empty() {
        let base = if root_prefix.is_empty() {
            "./"
        } else {
            root_prefix
        };
        return format!("{base}{suffix}");
    }
    // Non-page assets (anything with a file extension) keep their path
    // under the site root; pages get pretty-URL trailing slashes.
    let last_segment = path.rsplit('/').next().unwrap_or(path);
    if last_segment.contains('.') {
        format!("{root_prefix}{path}{suffix}")
    } else if path == INDEX_PATH {
        let base = if root_prefix.is_empty() {
            "./"
        } else {
            root_prefix
        };
        format!("{base}{suffix}")
    } else {
        format!("{root_prefix}{path}/{suffix}")
    }
}

/// Derives a unique anchor id from heading text.
fn unique_heading_id(text: &str, seen: &mut BTreeMap<String, usize>) -> String {
    let mut id = String::with_capacity(text.len());
    let mut last_was_hyphen = true;
    for c in text.chars() {
        if c.is_ascii_alphanumeric() {
            id.push(c.to_ascii_lowercase());
            last_was_hyphen = false;
        } else if !last_was_hyphen {
            id.push('-');
            last_was_hyphen = true;
        }
    }
    let id = id.trim_matches('-').to_string();
    let id = if id.is_empty() {
        "section".to_string()
    } else {
        id
    };
    let count = seen.entry(id.clone()).or_insert(0);
    *count += 1;
    if *count == 1 {
        id
    } else {
        format!("{id}-{}", *count - 1)
    }
}

/// Renders the sidebar nav entries (flattened tree with depth markers).
fn render_sidebar(
    nav: &[NavTreeNode],
    current_path: Option<&str>,
    root_prefix: &str,
) -> Vec<NavEntry> {
    let mut entries = Vec::new();
    render_sidebar_into(nav, current_path, root_prefix, 0, &mut entries);
    entries
}

fn render_sidebar_into(
    nodes: &[NavTreeNode],
    current_path: Option<&str>,
    root_prefix: &str,
    depth: usize,
    out: &mut Vec<NavEntry>,
) {
    for node in nodes {
        match node.node.kind {
            NavNodeKind::Group => {
                out.push(NavEntry {
                    title: node.node.title.clone(),
                    href: None,
                    current: false,
                    depth,
                });
                render_sidebar_into(&node.children, current_path, root_prefix, depth + 1, out);
            }
            NavNodeKind::Page => {
                if let Some(path) = node.node.path.as_ref() {
                    out.push(NavEntry {
                        title: node.node.title.clone(),
                        href: Some(page_href(path, root_prefix)),
                        current: current_path == Some(path.as_str()),
                        depth,
                    });
                }
                render_sidebar_into(&node.children, current_path, root_prefix, depth + 1, out);
            }
        }
    }
}

/// Renders the sitemap with absolute page URLs.
fn render_sitemap(public_base_url: &str, pages: &[SitePage]) -> String {
    let base = public_base_url.trim_end_matches('/');
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n",
    );
    for page in pages {
        let href = page_href_from_root(&page.path);
        xml.push_str(&format!("  <url><loc>{base}/{href}</loc></url>\n"));
    }
    xml.push_str("</urlset>\n");
    xml
}
