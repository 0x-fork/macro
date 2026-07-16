//! Askama template definitions for the default documentation theme.

use askama::Template;

/// One sidebar nav entry (flattened tree; `depth` drives indentation).
#[derive(Debug, Clone)]
pub struct NavEntry {
    /// Display title.
    pub title: String,
    /// Relative href for pages; `None` renders a group label.
    pub href: Option<String>,
    /// Whether this entry is the page being rendered.
    pub current: bool,
    /// Nesting depth (0 = top level).
    pub depth: usize,
}

/// One on-page table-of-contents entry.
#[derive(Debug, Clone)]
pub struct TocEntry {
    /// Heading text.
    pub title: String,
    /// Anchor id of the heading.
    pub anchor: String,
    /// Whether the entry is an `h3` (indented under the preceding `h2`).
    pub nested: bool,
}

/// A prev/next page link.
#[derive(Debug, Clone)]
pub struct PageLink {
    /// The linked page's title.
    pub title: String,
    /// Relative href of the linked page.
    pub href: String,
}

/// The main page template of the default theme.
#[derive(Template)]
#[template(path = "page.html")]
pub struct PageTemplate<'a> {
    /// The site's display name.
    pub site_name: &'a str,
    /// The page title.
    pub page_title: &'a str,
    /// Meta description derived from the page's first paragraph.
    pub description: &'a str,
    /// `../` repeated to reach the site root from this page.
    pub root_prefix: &'a str,
    /// Whether the markdown already starts with an `<h1>`.
    pub has_leading_heading: bool,
    /// The rendered page body.
    pub content_html: &'a str,
    /// Sidebar entries.
    pub sidebar: Vec<NavEntry>,
    /// On-page table of contents (h2/h3).
    pub toc: Vec<TocEntry>,
    /// The previous page in nav order.
    pub prev: Option<PageLink>,
    /// The next page in nav order.
    pub next: Option<PageLink>,
}

/// Minimal redirect page emitted at the site root when no `index` page
/// exists.
#[derive(Template)]
#[template(path = "redirect.html")]
pub struct RedirectTemplate<'a> {
    /// Relative target to redirect to.
    pub target: &'a str,
}
