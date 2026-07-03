//! Domain service for the "similar documents" surface.
//!
//! Reuses the task-dedup retrieval pipeline (embed → vector search → rerank →
//! score floor) over a separate document embedding store. Unlike task duplicate
//! detection there is no LLM judge and no persisted match graph: results are
//! computed on demand, exactly like the task composer's draft similarity
//! search.

#[cfg(test)]
mod test;

use std::borrow::Cow;
use std::sync::Arc;

use embedding::entity::Document;
use embedding::{EmbeddingModel, KeyedEmbedding, RerankModel, VectorStore};
use lexical_client::parse_markdown::EmbeddingMarkdown;
use uuid::Uuid;

use super::models::{DocumentSearchParameters, SimilarDocument, TaskDedupError};
use super::ports::DocumentNameRepo;
use super::retrieval::{self, full_text};

/// Configuration for the document similarity pipeline.
#[derive(Debug, Clone)]
pub struct DocumentSimilarityConfig {
    /// Maximum vector candidates to retrieve.
    pub vector_candidate_limit: i64,
    /// Maximum similar documents to return.
    pub result_limit: i64,
    /// Minimum vector similarity for a candidate to be considered.
    pub min_vector_similarity: f64,
    /// Minimum rerank score for a result to be returned. There is no LLM judge
    /// on this surface, so the reranker's score is the only relevance gate;
    /// the floor matches the task draft similarity search, which was tuned low
    /// (see `eval_similarity_rerank_floor`) to keep recall high.
    pub min_rerank_score: f64,
}

impl Default for DocumentSimilarityConfig {
    fn default() -> Self {
        Self {
            vector_candidate_limit: 24,
            result_limit: 10,
            min_vector_similarity: 0.35,
            min_rerank_score: 0.05,
        }
    }
}

/// The document a user is viewing, as the query of a similarity search.
#[derive(Debug, Clone)]
pub struct SimilarDocumentsQuery {
    /// Document id of the viewed document.
    pub document_id: String,
    /// Requesting user id; results are scoped to documents they can see.
    pub user: String,
    /// The user's team, when they belong to one, widening scope to documents
    /// shared with the team.
    pub team_id: Option<Uuid>,
    /// Document display name.
    pub title: String,
    /// Document body as [embedding-format markdown](EmbeddingMarkdown).
    pub markdown: EmbeddingMarkdown,
}

/// Document similarity service.
///
/// Embedding (`E`), vector storage (`V`), and reranking (`R`) are supplied by
/// the [`embedding`] crate's traits, generic for the same reason as
/// [`TaskDedupService`](super::service::TaskDedupService): those traits are not
/// object-safe. Name resolution remains a `dyn` port.
#[derive(Clone)]
pub struct DocumentSimilarityService<const DIMS: usize, E, V, R> {
    config: DocumentSimilarityConfig,
    embedder: E,
    vector_db: V,
    reranker: R,
    names: Arc<dyn DocumentNameRepo>,
}

impl<const DIMS: usize, E, V, R> DocumentSimilarityService<DIMS, E, V, R>
where
    E: EmbeddingModel<DIMS> + Send + Sync,
    V: VectorStore<DIMS, Metadata = String, SearchParameters = DocumentSearchParameters>
        + Send
        + Sync,
    V::Error: Into<anyhow::Error>,
    R: RerankModel<DIMS> + Send + Sync,
{
    /// Creates a service with the production configuration.
    ///
    /// The pipeline owns its tuning: consumers get the pinned
    /// [`DocumentSimilarityConfig::default`] and cannot vary it. Tests that
    /// need non-default limits use [`with_config`](Self::with_config).
    pub fn new(embedder: E, vector_db: V, reranker: R, names: Arc<dyn DocumentNameRepo>) -> Self {
        Self::with_config(
            DocumentSimilarityConfig::default(),
            embedder,
            vector_db,
            reranker,
            names,
        )
    }

    /// Creates a service with an explicit config.
    ///
    /// Not part of the supported consumer API — production builds the service
    /// with [`new`](Self::new), which pins the config. This exists only for
    /// the crate's own tests.
    #[doc(hidden)]
    pub fn with_config(
        config: DocumentSimilarityConfig,
        embedder: E,
        vector_db: V,
        reranker: R,
        names: Arc<dyn DocumentNameRepo>,
    ) -> Self {
        Self {
            config,
            embedder,
            vector_db,
            reranker,
            names,
        }
    }

    /// Finds existing documents similar to the one the user is viewing.
    ///
    /// Embeds the document, upserts the embedding into the store (so the
    /// corpus stays fresh without a separate indexing pipeline: every viewed
    /// document re-indexes itself), then runs vector retrieval + rerank over
    /// the other documents the user can see. Results are ordered by the
    /// reranker's relevance score.
    pub async fn similar_documents(
        &self,
        query: SimilarDocumentsQuery,
    ) -> Result<Vec<SimilarDocument>, TaskDedupError> {
        let embeddable = Document {
            title: Cow::Borrowed(query.title.as_str()),
            body: Cow::Borrowed(query.markdown.as_ref()),
        };
        let labeled = self.embedder.embed(&embeddable).await?;
        if labeled.is_empty() {
            return Ok(Vec::new());
        }

        // Build the search query before moving the labeled embeddings into the
        // store; the vectors are `Copy` so this borrows rather than clones.
        let search_query: Vec<KeyedEmbedding<DIMS>> = labeled
            .iter()
            .map(|field| KeyedEmbedding {
                search_key: field.search_key,
                embedding: field.embedding,
            })
            .collect();

        self.vector_db
            .upsert_embeddings(query.document_id.clone(), labeled)
            .await
            .map_err(|error| TaskDedupError::Dependency(error.into()))?;

        let params = DocumentSearchParameters {
            user: query.user.clone(),
            team_id: query.team_id,
            limit: self.config.vector_candidate_limit,
            exclude_document_id: Some(query.document_id.clone()),
        };
        let results = self
            .vector_db
            .cosine_search(search_query, params)
            .await
            .map_err(|error| TaskDedupError::Dependency(error.into()))?;

        // No judge runs on this surface, so the rerank score is the only
        // relevance gate; results below the floor are noise the panel
        // shouldn't show. Reranked results are ordered by score, so the floor
        // trims a suffix.
        let query_content = full_text(&query.title, query.markdown.as_ref());
        let ranked = retrieval::rerank(
            &self.reranker,
            &query_content,
            results,
            self.config.min_vector_similarity,
        )
        .await?
        .into_iter()
        .filter(|(_, rerank_score)| f64::from(*rerank_score) >= self.config.min_rerank_score)
        .map(|(candidate, _)| candidate)
        .take(self.config.result_limit.max(0) as usize)
        .collect::<Vec<_>>();

        let document_ids = ranked
            .iter()
            .map(|candidate| candidate.document_id.clone())
            .collect::<Vec<_>>();
        let names = self.names.document_names(&document_ids).await?;

        // A document whose name lookup came back empty was deleted between the
        // search and the lookup; drop it rather than show a nameless row.
        Ok(ranked
            .into_iter()
            .filter_map(|candidate| {
                names
                    .get(&candidate.document_id)
                    .map(|name| SimilarDocument {
                        document_name: name.clone(),
                        document_id: candidate.document_id,
                        vector_score: candidate.vector_score,
                    })
            })
            .collect())
    }
}
