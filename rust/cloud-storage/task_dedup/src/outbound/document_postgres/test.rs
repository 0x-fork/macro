use std::sync::Arc;

use embedding::embedding_provider::openai::DIMS;
use embedding::{
    Content, Embeddable, EmbeddingModel, KeyedEmbedding, LabeledEmbedding, RerankModel, Reranked,
    SearchResults, VectorStore,
};
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use sqlx::PgPool;
use uuid::Uuid;

use super::*;
use crate::EmbeddingMarkdown;
use crate::domain::document_similarity::{DocumentSimilarityService, SimilarDocumentsQuery};
use crate::domain::models::DocumentSearchParameters;
use crate::outbound::postgres::vector_sql_literal;

const OWNER: &str = "macro|user@user.com";
const TEAMMATE: &str = "macro|teammate1@user.com";
const TEAM_ID: Uuid = uuid::uuid!("a0000000-0000-0000-0000-000000000001");
const DOC_ONE: &str = "d2000000-0000-0000-0000-000000000001";
const DOC_TWO: &str = "d2000000-0000-0000-0000-000000000002";
const DOC_THREE: &str = "d2000000-0000-0000-0000-000000000003";
const DOC_OTHER: &str = "d2000000-0000-0000-0000-000000000004";

type TestService = DocumentSimilarityService<DIMS, LocalEmbedder, PgDocumentVectorDb, NoOpReranker>;

/// Test-only reranker that preserves the upstream vector-similarity ordering,
/// carrying each candidate's best vector score through unchanged, so these
/// tests exercise the store rather than a reranking model.
#[derive(Clone, Copy)]
struct NoOpReranker;

impl<const D: usize> RerankModel<D> for NoOpReranker {
    async fn rerank<'a, T: Send>(
        &self,
        _query: Content<'a>,
        candidates: Vec<SearchResults<T, D>>,
    ) -> anyhow::Result<Vec<Reranked<T>>> {
        Ok(candidates
            .into_iter()
            .map(|result| {
                let score = result
                    .matches
                    .iter()
                    .map(|matched| matched.score)
                    .fold(f32::NEG_INFINITY, f32::max);
                Reranked {
                    item: result.metadata,
                    score,
                }
            })
            .collect())
    }
}

/// Deterministic, offline embedder so similarity logic can be exercised without
/// calling OpenAI. Each field is embedded independently with
/// [`local_embedding`].
struct LocalEmbedder;

impl EmbeddingModel<DIMS> for LocalEmbedder {
    async fn embed(
        &self,
        content: &(dyn Embeddable + Sync),
    ) -> anyhow::Result<Vec<LabeledEmbedding<'static, DIMS>>> {
        Ok(content
            .embedding_content()
            .into_iter()
            .map(|(search_key, text)| LabeledEmbedding {
                search_key,
                embedding: local_embedding(text.as_ref()),
                content: Content::Owned(text.into_owned()),
            })
            .collect())
    }
}

/// Deterministic local embedding used only by tests. Hashes each token into a
/// fixed bucket so semantically identical inputs produce identical vectors,
/// which is enough for the pgvector similarity tests.
fn local_embedding(text: &str) -> [f32; DIMS] {
    let mut vector = [0.0_f32; DIMS];
    for token in text
        .split(|ch: char| !ch.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|token| token.len() > 2)
    {
        let mut hash = 1469598103934665603_u64;
        for byte in token.as_bytes() {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(1099511628211);
        }
        let idx = (hash as usize) % DIMS;
        let sign = if hash & 1 == 0 { 1.0 } else { -1.0 };
        vector[idx] += sign;
    }

    let norm = vector
        .iter()
        .map(|value| value * value)
        .sum::<f32>()
        .sqrt()
        .max(1.0);
    for value in &mut vector {
        *value /= norm;
    }
    vector
}

fn service(pool: PgPool) -> TestService {
    let vector_db = PgDocumentVectorDb::new(pool);
    DocumentSimilarityService::new(
        LocalEmbedder,
        vector_db.clone(),
        NoOpReranker,
        Arc::new(vector_db),
    )
}

async fn insert_document(pool: &PgPool, id: &str, name: &str, owner: &str) {
    sqlx::query!(
        r#"
        INSERT INTO "Document" (id, name, "fileType", owner)
        VALUES ($1, $2, 'md', $3)
        "#,
        id,
        name,
        owner,
    )
    .execute(pool)
    .await
    .unwrap();
}

async fn insert_task(pool: &PgPool, id: &str, name: &str, owner: &str) {
    insert_document(pool, id, name, owner).await;
    sqlx::query!(
        r#"
        INSERT INTO document_sub_type (document_id, sub_type)
        VALUES ($1, 'task')
        "#,
        id,
    )
    .execute(pool)
    .await
    .unwrap();
}

/// Grants `source_id` view access on a document through `entity_access`, the
/// way document sharing stores direct and team grants.
async fn grant_access(pool: &PgPool, document_id: &str, source_id: &str, source_type: &str) {
    sqlx::query(
        r#"
        INSERT INTO entity_access (entity_id, entity_type, source_id, source_type, access_level)
        VALUES ($1::uuid, 'document', $2, $3::entity_access_source_type, 'view')
        "#,
    )
    .bind(document_id)
    .bind(source_id)
    .bind(source_type)
    .execute(pool)
    .await
    .unwrap();
}

/// Seeds the two per-field embeddings (`title`, `body`) a document would have
/// after the live pipeline embedded it.
async fn insert_document_embedding(pool: &PgPool, document_id: &str, title: &str, body: &str) {
    for (search_key, text) in [("title", title), ("body", body)] {
        let embedding = vector_sql_literal(&local_embedding(text));
        sqlx::query!(
            r#"
            INSERT INTO document_similarity_embedding (document_id, search_key, content, embedding)
            VALUES ($1, $2, $3, $4::text::vector)
            "#,
            document_id,
            search_key,
            text,
            embedding,
        )
        .execute(pool)
        .await
        .unwrap();
    }
}

const ROADMAP_TITLE: &str = "Roadmap for embedding search";
const ROADMAP_BODY: &str = "Ship pgvector embedding retrieval across document surfaces.";

fn roadmap_query(document_id: &str, team_id: Option<Uuid>) -> SimilarDocumentsQuery {
    SimilarDocumentsQuery {
        document_id: document_id.to_string(),
        user: OWNER.to_string(),
        team_id,
        title: ROADMAP_TITLE.to_string(),
        markdown: EmbeddingMarkdown::from_client_trusted(ROADMAP_BODY.to_string()),
    }
}

fn search_params(
    user: &str,
    team_id: Option<Uuid>,
    exclude: Option<&str>,
) -> DocumentSearchParameters {
    DocumentSearchParameters {
        user: user.to_string(),
        team_id,
        limit: 10,
        exclude_document_id: exclude.map(str::to_string),
    }
}

fn roadmap_search_query() -> Vec<KeyedEmbedding<DIMS>> {
    vec![
        KeyedEmbedding {
            search_key: "title",
            embedding: local_embedding(ROADMAP_TITLE),
        },
        KeyedEmbedding {
            search_key: "body",
            embedding: local_embedding(ROADMAP_BODY),
        },
    ]
}

fn result_ids(results: &[SearchResults<String, DIMS>]) -> Vec<&str> {
    results
        .iter()
        .map(|result| result.metadata.as_str())
        .collect()
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(
        path = "../../../../documents/fixtures",
        scripts("documents_test_data")
    )
)]
async fn upsert_embeddings_inserts_and_updates(pool: PgPool) {
    insert_document(&pool, DOC_ONE, "Roadmap", OWNER).await;
    let vector_db = PgDocumentVectorDb::new(pool.clone());

    vector_db
        .upsert_embeddings(
            DOC_ONE.to_string(),
            vec![LabeledEmbedding {
                search_key: "title",
                content: Content::Owned("first title".to_string()),
                embedding: local_embedding("first title"),
            }],
        )
        .await
        .unwrap();

    // Upserting the same field again replaces the stored content.
    vector_db
        .upsert_embeddings(
            DOC_ONE.to_string(),
            vec![LabeledEmbedding {
                search_key: "title",
                content: Content::Owned("second title".to_string()),
                embedding: local_embedding("second title"),
            }],
        )
        .await
        .unwrap();

    let rows = sqlx::query!(
        r#"
        SELECT search_key, content
        FROM document_similarity_embedding
        WHERE document_id = $1
        ORDER BY search_key
        "#,
        DOC_ONE,
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].search_key, "title");
    assert_eq!(rows[0].content, "second title");
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(
        path = "../../../../documents/fixtures",
        scripts("documents_test_data")
    )
)]
async fn cosine_search_scopes_to_own_shared_and_team_documents(pool: PgPool) {
    // The user's own document.
    insert_document(&pool, DOC_ONE, "Embedding roadmap", OWNER).await;
    insert_document_embedding(&pool, DOC_ONE, ROADMAP_TITLE, ROADMAP_BODY).await;

    // A teammate's documents: one unshared, one shared with the user directly,
    // one shared with the team.
    insert_document(&pool, DOC_TWO, "Private teammate doc", TEAMMATE).await;
    insert_document_embedding(&pool, DOC_TWO, ROADMAP_TITLE, ROADMAP_BODY).await;

    insert_document(&pool, DOC_THREE, "Directly shared doc", TEAMMATE).await;
    insert_document_embedding(&pool, DOC_THREE, ROADMAP_TITLE, ROADMAP_BODY).await;
    grant_access(&pool, DOC_THREE, OWNER, "user").await;

    insert_document(&pool, DOC_OTHER, "Team shared doc", TEAMMATE).await;
    insert_document_embedding(&pool, DOC_OTHER, ROADMAP_TITLE, ROADMAP_BODY).await;
    grant_access(&pool, DOC_OTHER, &TEAM_ID.to_string(), "team").await;

    let vector_db = PgDocumentVectorDb::new(pool);

    let results = vector_db
        .cosine_search(
            roadmap_search_query(),
            search_params(OWNER, Some(TEAM_ID), None),
        )
        .await
        .unwrap();
    let mut ids = result_ids(&results);
    ids.sort();
    assert_eq!(
        ids,
        vec![DOC_ONE, DOC_THREE, DOC_OTHER],
        "own + direct-share + team-share are in scope; unshared teammate doc is not"
    );

    // Without a team, the team-shared document falls out of scope.
    let results = vector_db
        .cosine_search(roadmap_search_query(), search_params(OWNER, None, None))
        .await
        .unwrap();
    let mut ids = result_ids(&results);
    ids.sort();
    assert_eq!(ids, vec![DOC_ONE, DOC_THREE]);
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(
        path = "../../../../documents/fixtures",
        scripts("documents_test_data")
    )
)]
async fn cosine_search_excludes_self_tasks_and_deleted_documents(pool: PgPool) {
    insert_document(&pool, DOC_ONE, "Embedding roadmap", OWNER).await;
    insert_document_embedding(&pool, DOC_ONE, ROADMAP_TITLE, ROADMAP_BODY).await;

    // A task with identical content: excluded because tasks have their own
    // duplicate surface.
    insert_task(&pool, DOC_TWO, "Embedding roadmap task", OWNER).await;
    insert_document_embedding(&pool, DOC_TWO, ROADMAP_TITLE, ROADMAP_BODY).await;

    // A deleted document with identical content.
    insert_document(&pool, DOC_THREE, "Deleted roadmap", OWNER).await;
    insert_document_embedding(&pool, DOC_THREE, ROADMAP_TITLE, ROADMAP_BODY).await;
    sqlx::query!(
        r#"UPDATE "Document" SET "deletedAt" = NOW() WHERE id = $1"#,
        DOC_THREE,
    )
    .execute(&pool)
    .await
    .unwrap();

    let vector_db = PgDocumentVectorDb::new(pool);

    // Searching from DOC_ONE excludes the query document itself, the task, and
    // the deleted document.
    let results = vector_db
        .cosine_search(
            roadmap_search_query(),
            search_params(OWNER, None, Some(DOC_ONE)),
        )
        .await
        .unwrap();
    assert!(result_ids(&results).is_empty());

    // Without the self-exclusion the owned live document comes back.
    let results = vector_db
        .cosine_search(roadmap_search_query(), search_params(OWNER, None, None))
        .await
        .unwrap();
    assert_eq!(result_ids(&results), vec![DOC_ONE]);
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(
        path = "../../../../documents/fixtures",
        scripts("documents_test_data")
    )
)]
async fn document_names_resolves_live_documents_only(pool: PgPool) {
    insert_document(&pool, DOC_ONE, "Embedding roadmap", OWNER).await;
    insert_document(&pool, DOC_TWO, "Deleted doc", OWNER).await;
    sqlx::query!(
        r#"UPDATE "Document" SET "deletedAt" = NOW() WHERE id = $1"#,
        DOC_TWO,
    )
    .execute(&pool)
    .await
    .unwrap();

    let repo = PgDocumentVectorDb::new(pool);
    let names = repo
        .document_names(&[DOC_ONE.to_string(), DOC_TWO.to_string()])
        .await
        .unwrap();

    assert_eq!(names.len(), 1);
    assert_eq!(
        names.get(DOC_ONE).map(String::as_str),
        Some("Embedding roadmap")
    );
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(
        path = "../../../../documents/fixtures",
        scripts("documents_test_data")
    )
)]
async fn similar_documents_indexes_the_viewed_document_and_returns_matches(pool: PgPool) {
    // An existing similar document and an unrelated one.
    insert_document(&pool, DOC_TWO, "Embedding retrieval plan", OWNER).await;
    insert_document_embedding(
        &pool,
        DOC_TWO,
        "Embedding retrieval plan",
        "Ship pgvector embedding retrieval across document surfaces.",
    )
    .await;
    insert_document(&pool, DOC_THREE, "Grocery list", OWNER).await;
    insert_document_embedding(&pool, DOC_THREE, "Grocery list", "eggs milk bread butter").await;

    // The viewed document exists but has no embedding yet.
    insert_document(&pool, DOC_ONE, ROADMAP_TITLE, OWNER).await;

    let service = service(pool.clone());
    let results = service
        .similar_documents(roadmap_query(DOC_ONE, Some(TEAM_ID)))
        .await
        .unwrap();

    assert_eq!(
        results.len(),
        1,
        "only the related document clears the floor"
    );
    assert_eq!(results[0].document_id, DOC_TWO);
    assert_eq!(results[0].document_name, "Embedding retrieval plan");

    // Viewing the document indexed it, so it is now retrievable from the
    // other document's perspective.
    let embedded = sqlx::query_scalar!(
        r#"
        SELECT COUNT(*) AS "count!"
        FROM document_similarity_embedding
        WHERE document_id = $1
        "#,
        DOC_ONE,
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(embedded, 2, "title and body rows were upserted");
}
