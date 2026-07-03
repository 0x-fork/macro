//! Service-level pipeline tests against in-memory mock dependencies.
//!
//! These exercise [`DocumentSimilarityService`] end to end without a database:
//! the embedder, vector store, reranker, and name repo are all mocked here so
//! the embed → upsert → retrieve → rerank → floor pipeline can be asserted in
//! isolation.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use embedding::{
    Content, Embeddable, EmbeddingModel, KeyedEmbedding, LabeledEmbedding, Match, RerankModel,
    Reranked, SearchResults, VectorStore,
};
use uuid::Uuid;

use super::{DocumentSimilarityConfig, DocumentSimilarityService, SimilarDocumentsQuery};
use crate::EmbeddingMarkdown;
use crate::domain::models::{DocumentSearchParameters, TaskDedupError};
use crate::domain::ports::DocumentNameRepo;

/// Small embedding width so mock vectors stay tiny.
const DIMS: usize = 4;

type MockService = DocumentSimilarityService<DIMS, MockEmbedder, MockVectorDb, MockReranker>;

const USER: &str = "macro|user@user.com";
const TEAM_ID: Uuid = uuid::uuid!("a0000000-0000-0000-0000-000000000001");
const VIEWED_DOCUMENT: &str = "d1000000-0000-0000-0000-000000000001";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/// Embedder that emits a zero vector per field exposed by the content.
struct MockEmbedder;

impl EmbeddingModel<DIMS> for MockEmbedder {
    async fn embed(
        &self,
        content: &(dyn Embeddable + Sync),
    ) -> anyhow::Result<Vec<LabeledEmbedding<'static, DIMS>>> {
        Ok(content
            .embedding_content()
            .into_iter()
            .map(|(search_key, text)| LabeledEmbedding {
                search_key,
                content: Content::Owned(text.into_owned()),
                embedding: [0.0; DIMS],
            })
            .collect())
    }
}

/// Vector store returning preset `(document_id, content, score)` candidates,
/// each as a single-field [`SearchResults`]. Records upserts and the last
/// search parameters so the pipeline can be asserted.
#[derive(Clone, Default)]
struct MockVectorDb {
    inner: Arc<MockVectorDbInner>,
}

#[derive(Default)]
struct MockVectorDbInner {
    results: Vec<(String, String, f32)>,
    upserted: Mutex<Vec<String>>,
    last_params: Mutex<Option<DocumentSearchParameters>>,
}

impl MockVectorDb {
    fn with_results(results: Vec<(&str, &str, f32)>) -> Self {
        Self {
            inner: Arc::new(MockVectorDbInner {
                results: results
                    .into_iter()
                    .map(|(id, content, score)| (id.to_string(), content.to_string(), score))
                    .collect(),
                ..Default::default()
            }),
        }
    }

    fn upserted(&self) -> Vec<String> {
        self.inner.upserted.lock().unwrap().clone()
    }

    fn last_params(&self) -> Option<DocumentSearchParameters> {
        self.inner.last_params.lock().unwrap().clone()
    }
}

impl VectorStore<DIMS> for MockVectorDb {
    type Error = anyhow::Error;
    type Metadata = String;
    type SearchParameters = DocumentSearchParameters;

    async fn upsert_embeddings<'a>(
        &self,
        metadata: String,
        _embeddings: Vec<LabeledEmbedding<'a, DIMS>>,
    ) -> anyhow::Result<()> {
        self.inner.upserted.lock().unwrap().push(metadata);
        Ok(())
    }

    async fn cosine_search(
        &self,
        _query: Vec<KeyedEmbedding<DIMS>>,
        params: DocumentSearchParameters,
    ) -> anyhow::Result<Vec<SearchResults<String, DIMS>>> {
        *self.inner.last_params.lock().unwrap() = Some(params);
        Ok(self
            .inner
            .results
            .iter()
            .map(|(id, content, score)| SearchResults {
                metadata: id.clone(),
                matches: vec![Match {
                    score: *score,
                    embedding: LabeledEmbedding {
                        search_key: "title",
                        content: Content::Owned(content.clone()),
                        embedding: [0.0; DIMS],
                    },
                }],
            })
            .collect())
    }
}

/// Reranker that scores candidates from a content→score map (default 0.0),
/// returning them sorted by descending score.
#[derive(Clone, Default)]
struct MockReranker {
    scores: Arc<HashMap<String, f64>>,
}

impl MockReranker {
    fn new(scores: &[(&str, f64)]) -> Self {
        Self {
            scores: Arc::new(scores.iter().map(|(k, v)| (k.to_string(), *v)).collect()),
        }
    }
}

impl<const D: usize> RerankModel<D> for MockReranker {
    async fn rerank<'a, T: Send>(
        &self,
        _query: Content<'a>,
        candidates: Vec<SearchResults<T, D>>,
    ) -> anyhow::Result<Vec<Reranked<T>>> {
        let mut scored = candidates
            .into_iter()
            .map(|result| {
                let content = result
                    .matches
                    .iter()
                    .map(|matched| matched.embedding.content.as_ref())
                    .collect::<Vec<_>>()
                    .join("\n");
                let score = self.scores.get(&content).copied().unwrap_or(0.0) as f32;
                Reranked {
                    item: result.metadata,
                    score,
                }
            })
            .collect::<Vec<_>>();
        scored.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        Ok(scored)
    }
}

/// Name repo backed by a fixed map; documents absent from the map are treated
/// as deleted.
#[derive(Default)]
struct MockNames {
    names: HashMap<String, String>,
}

impl MockNames {
    fn new(names: &[(&str, &str)]) -> Self {
        Self {
            names: names
                .iter()
                .map(|(id, name)| (id.to_string(), name.to_string()))
                .collect(),
        }
    }
}

#[async_trait]
impl DocumentNameRepo for MockNames {
    async fn document_names(
        &self,
        document_ids: &[String],
    ) -> Result<HashMap<String, String>, TaskDedupError> {
        Ok(document_ids
            .iter()
            .filter_map(|id| self.names.get(id).map(|name| (id.clone(), name.clone())))
            .collect())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn service(vector_db: MockVectorDb, reranker: MockReranker, names: MockNames) -> MockService {
    DocumentSimilarityService::new(MockEmbedder, vector_db, reranker, Arc::new(names))
}

fn query() -> SimilarDocumentsQuery {
    SimilarDocumentsQuery {
        document_id: VIEWED_DOCUMENT.to_string(),
        user: USER.to_string(),
        team_id: Some(TEAM_ID),
        title: "Roadmap 2026".to_string(),
        markdown: EmbeddingMarkdown::from_client_trusted(
            "Plans for the next two quarters.".to_string(),
        ),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[tokio::test]
async fn returns_results_in_rerank_order_with_names() {
    let vector_db = MockVectorDb::with_results(vec![
        ("doc-a", "quarterly planning", 0.9),
        ("doc-b", "roadmap draft", 0.8),
    ]);
    let reranker = MockReranker::new(&[("quarterly planning", 0.3), ("roadmap draft", 0.7)]);
    let names = MockNames::new(&[("doc-a", "Quarterly Planning"), ("doc-b", "Roadmap Draft")]);
    let service = service(vector_db.clone(), reranker, names);

    let results = service.similar_documents(query()).await.unwrap();

    let ids: Vec<&str> = results
        .iter()
        .map(|result| result.document_id.as_str())
        .collect();
    assert_eq!(ids, vec!["doc-b", "doc-a"], "rerank order wins");
    assert_eq!(results[0].document_name, "Roadmap Draft");
    assert!((results[0].vector_score - 0.8).abs() < 1e-6);

    // The viewed document was indexed and excluded from its own results.
    assert_eq!(vector_db.upserted(), vec![VIEWED_DOCUMENT.to_string()]);
    let params = vector_db.last_params().unwrap();
    assert_eq!(params.exclude_document_id.as_deref(), Some(VIEWED_DOCUMENT));
    assert_eq!(params.user, USER);
    assert_eq!(params.team_id, Some(TEAM_ID));
}

#[tokio::test]
async fn drops_results_below_the_rerank_floor() {
    let vector_db = MockVectorDb::with_results(vec![
        ("doc-a", "quarterly planning", 0.9),
        ("doc-b", "grocery list", 0.6),
    ]);
    // The floor is 0.05; "grocery list" scores below it.
    let reranker = MockReranker::new(&[("quarterly planning", 0.4), ("grocery list", 0.01)]);
    let names = MockNames::new(&[("doc-a", "Quarterly Planning"), ("doc-b", "Grocery List")]);
    let service = service(vector_db, reranker, names);

    let results = service.similar_documents(query()).await.unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].document_id, "doc-a");
}

#[tokio::test]
async fn drops_results_below_the_vector_similarity_floor() {
    // 0.2 is below the 0.35 vector floor, so it never reaches the reranker.
    let vector_db = MockVectorDb::with_results(vec![("doc-a", "quarterly planning", 0.2)]);
    let reranker = MockReranker::new(&[("quarterly planning", 0.9)]);
    let names = MockNames::new(&[("doc-a", "Quarterly Planning")]);
    let service = service(vector_db, reranker, names);

    let results = service.similar_documents(query()).await.unwrap();

    assert!(results.is_empty());
}

#[tokio::test]
async fn drops_results_whose_document_was_deleted() {
    let vector_db = MockVectorDb::with_results(vec![
        ("doc-a", "quarterly planning", 0.9),
        ("doc-gone", "old roadmap", 0.8),
    ]);
    let reranker = MockReranker::new(&[("quarterly planning", 0.5), ("old roadmap", 0.4)]);
    // "doc-gone" has no name row: deleted between search and lookup.
    let names = MockNames::new(&[("doc-a", "Quarterly Planning")]);
    let service = service(vector_db, reranker, names);

    let results = service.similar_documents(query()).await.unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].document_id, "doc-a");
}

#[tokio::test]
async fn embeds_nothing_and_searches_nothing_for_an_empty_document() {
    let vector_db = MockVectorDb::with_results(vec![("doc-a", "quarterly planning", 0.9)]);
    let reranker = MockReranker::default();
    let names = MockNames::default();
    let service = service(vector_db.clone(), reranker, names);

    let mut empty = query();
    empty.title = " ".to_string();
    empty.markdown = EmbeddingMarkdown::from_client_trusted("\n".to_string());

    let results = service.similar_documents(empty).await.unwrap();

    assert!(results.is_empty());
    assert!(vector_db.upserted().is_empty(), "no embedding to persist");
    assert!(vector_db.last_params().is_none(), "no search should run");
}

#[tokio::test]
async fn caps_results_at_the_configured_limit() {
    let candidates: Vec<(String, String, f32)> = (0..15)
        .map(|index| {
            (
                format!("doc-{index}"),
                format!("content {index}"),
                0.9_f32 - index as f32 * 0.01,
            )
        })
        .collect();
    let vector_db = MockVectorDb::with_results(
        candidates
            .iter()
            .map(|(id, content, score)| (id.as_str(), content.as_str(), *score))
            .collect(),
    );
    let scores: Vec<(String, f64)> = candidates
        .iter()
        .enumerate()
        .map(|(index, (_, content, _))| (content.clone(), 1.0 - index as f64 * 0.01))
        .collect();
    let reranker = MockReranker::new(
        &scores
            .iter()
            .map(|(content, score)| (content.as_str(), *score))
            .collect::<Vec<_>>(),
    );
    let names = MockNames::new(
        &candidates
            .iter()
            .map(|(id, _, _)| (id.as_str(), id.as_str()))
            .collect::<Vec<_>>(),
    );
    let service = service(vector_db, reranker, names);

    let results = service.similar_documents(query()).await.unwrap();

    assert_eq!(
        results.len(),
        DocumentSimilarityConfig::default().result_limit as usize
    );
}
