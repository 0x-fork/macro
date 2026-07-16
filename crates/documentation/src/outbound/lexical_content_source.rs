//! MacroDB documents' markdown export via the lexical service.

use std::sync::Arc;

use lexical_client::{LexicalClient, parse_markdown::MarkdownTarget};

use crate::domain::ports::PageContentSource;

/// [`PageContentSource`] backed by the lexical service's markdown export.
/// Uses [`MarkdownTarget::External`] — clean GitHub-flavored markdown with
/// internal markup stripped — which is the right form for a public site.
#[derive(Clone)]
pub struct LexicalPageContentSource {
    client: Arc<LexicalClient>,
}

impl LexicalPageContentSource {
    /// Creates a new content source wrapping the given lexical client.
    pub fn new(client: Arc<LexicalClient>) -> Self {
        Self { client }
    }
}

impl PageContentSource for LexicalPageContentSource {
    #[tracing::instrument(skip(self), err)]
    async fn get_markdown(&self, document_id: &str) -> Result<String, rootcause::Report> {
        self.client
            .get_markdown(document_id, MarkdownTarget::External)
            .await
            .map_err(|e| rootcause::report!("exporting markdown for {document_id}: {e:#}"))
    }
}
