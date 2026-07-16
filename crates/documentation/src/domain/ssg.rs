//! Static site generator for documentation sites.
//!
//! Pure transformation: a site, its nav tree, and each page's markdown go
//! in; the complete static site (HTML pages, theme assets, search index,
//! sitemap) comes out as [`crate::domain::ports::RenderedFile`]s. No IO
//! happens here — fetching markdown and uploading files live behind ports.

/// Markdown → HTML rendering and site assembly.
mod render;

/// Askama template definitions.
mod templates;

#[cfg(test)]
mod test;

pub use render::{RenderSiteInput, SitePage, render_site};
