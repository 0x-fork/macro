#![deny(missing_docs)]
//! Task duplicate detection and document similarity search.
//!
//! The crate keeps the duplicate-detection workflow behind ports so the judge,
//! match persistence, and live-update transport can be swapped independently.
//! Embedding, reranking, and vector storage are provided by the [`embedding`]
//! crate's traits and injected as generic parameters into [`TaskDedupService`].
//!
//! [`DocumentSimilarityService`] reuses the same retrieval pipeline (embed →
//! vector search → rerank) over a separate document embedding store to power
//! the "similar documents" surface — no judge and no persisted match state.

pub mod domain;
pub mod eval;
pub mod outbound;

use embedding::embedding_provider::openai::{DIMS, TextEmbedding3Small};

pub use domain::document_similarity::{
    DocumentSimilarityConfig, DocumentSimilarityService, SimilarDocumentsQuery,
};
pub use domain::models::{
    DocumentSearchParameters, JudgeResult, NewTask, SimilarDocument, TaskDedupError, TaskDuplicate,
    TaskSearchParameters, TaskSimilarityResult,
};
pub use domain::service::{TaskDedupConfig, TaskDedupService};
/// The embedding-format markdown newtype required by [`NewTask`] and
/// [`TaskDedupService::similarity_search`], re-exported so consumers get it from
/// this crate. Its only constructors are the lexical fetch and an explicit
/// client-trusted wrapper, so wrong-format bodies cannot reach the embedder.
pub use lexical_client::parse_markdown::EmbeddingMarkdown;
use outbound::cohere::CohereReranker;
use outbound::document_postgres::PgDocumentVectorDb;
use outbound::postgres::PgTaskVectorDb;

/// The production task-dedup service: OpenAI `text-embedding-3-small` embeddings,
/// a Postgres/pgvector store, and the Cohere reranker. Consumers depend on this
/// concrete type so the generic [`TaskDedupService`] parameters do not leak into
/// axum state and handler signatures.
pub type PgTaskDedupService =
    TaskDedupService<DIMS, TextEmbedding3Small, PgTaskVectorDb, CohereReranker>;

/// The production document-similarity service: the same OpenAI embeddings,
/// Postgres/pgvector storage, and Cohere reranker as task dedup, over the
/// document embedding store. Consumers depend on this concrete type so the
/// generic [`DocumentSimilarityService`] parameters do not leak into axum
/// state and handler signatures.
pub type PgDocumentSimilarityService =
    DocumentSimilarityService<DIMS, TextEmbedding3Small, PgDocumentVectorDb, CohereReranker>;
