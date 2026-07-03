//! Postgres adapters for document similarity search.
//!
//! [`PgDocumentVectorDb`] implements the embedding crate's
//! [`VectorStore`](embedding::VectorStore) over the
//! `document_similarity_embedding` table (one row per `(document_id,
//! search_key)` field) and doubles as the
//! [`DocumentNameRepo`](crate::domain::ports::DocumentNameRepo) used to resolve
//! result display names.

#[cfg(test)]
mod test;

use std::collections::HashMap;

use anyhow::Context;
use async_trait::async_trait;
use embedding::embedding_provider::openai::DIMS;
use embedding::{Content, KeyedEmbedding, LabeledEmbedding, Match, SearchResults, VectorStore};
use sqlx::PgPool;

use crate::domain::models::{DocumentSearchParameters, TaskDedupError};
use crate::domain::ports::DocumentNameRepo;

use super::postgres::{parse_vector, search_key_static, vector_sql_literal};

/// Postgres/pgvector implementation of [`VectorStore`] for document embeddings.
///
/// Each document contributes one row per embeddable field (`title`, `body`);
/// the composite primary key `(document_id, search_key)` keeps them distinct.
#[derive(Clone)]
pub struct PgDocumentVectorDb {
    pool: PgPool,
}

impl PgDocumentVectorDb {
    /// Creates a store over `pool`.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl VectorStore<DIMS> for PgDocumentVectorDb {
    type Error = anyhow::Error;
    type Metadata = String;
    type SearchParameters = DocumentSearchParameters;

    async fn upsert_embeddings<'a>(
        &self,
        metadata: String,
        embeddings: Vec<LabeledEmbedding<'a, DIMS>>,
    ) -> anyhow::Result<()> {
        if embeddings.is_empty() {
            return Ok(());
        }

        let search_keys: Vec<String> = embeddings
            .iter()
            .map(|field| field.search_key.to_string())
            .collect();
        let contents: Vec<String> = embeddings
            .iter()
            .map(|field| field.content.as_ref().to_string())
            .collect();
        let vectors: Vec<String> = embeddings
            .iter()
            .map(|field| vector_sql_literal(&field.embedding))
            .collect();

        sqlx::query!(
            r#"
            INSERT INTO document_similarity_embedding (document_id, search_key, content, embedding)
            SELECT $1, sk, ct, emb::vector
            FROM unnest($2::text[], $3::text[], $4::text[]) AS t(sk, ct, emb)
            ON CONFLICT (document_id, search_key) DO UPDATE
            SET content = EXCLUDED.content,
                embedding = EXCLUDED.embedding,
                updated_at = NOW()
            "#,
            metadata,
            &search_keys,
            &contents,
            &vectors,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn cosine_search(
        &self,
        query: Vec<KeyedEmbedding<DIMS>>,
        params: DocumentSearchParameters,
    ) -> anyhow::Result<Vec<SearchResults<String, DIMS>>> {
        if query.is_empty() {
            return Ok(Vec::new());
        }

        let query_keys: Vec<String> = query.iter().map(|q| q.search_key.to_string()).collect();
        let query_vectors: Vec<String> = query
            .iter()
            .map(|q| vector_sql_literal(&q.embedding))
            .collect();
        let team_id = params.team_id.map(|team_id| team_id.to_string());

        // Each candidate field is scored by its best similarity to ANY query
        // field, giving the full query × stored cross-product (title↔title,
        // title↔body, body↔title, body↔body). Entities are ranked by their
        // best field score and capped at `limit`; all of a kept entity's field
        // rows are returned so the service can reconstruct its text.
        //
        // Scope: plain markdown documents (no `document_sub_type` row — tasks
        // and snippets have their own surfaces) that the user owns or that are
        // shared with them directly or through their team via `entity_access`.
        // The `entity_access` join goes through `entity_id::text`, which is
        // covered by `idx_entity_access_entity_text_type_source`.
        //
        // Iterative index scan keeps recall high despite the access and
        // sub-type filters dropping rows after the HNSW scan. SET LOCAL binds
        // to the transaction's connection, so the search must run in the same
        // transaction to see it.
        let mut tx = self.pool.begin().await?;
        sqlx::query!("SET LOCAL hnsw.iterative_scan = relaxed_order")
            .execute(&mut *tx)
            .await?;
        let rows = sqlx::query!(
            r#"
            WITH query AS (
                SELECT key, vec::vector AS vec
                FROM unnest($1::text[], $2::text[]) AS t(key, vec)
            ),
            scored AS (
                SELECT
                    e.document_id,
                    e.search_key,
                    e.content,
                    e.embedding::text AS embedding_text,
                    MAX(1 - (e.embedding <=> q.vec))::real AS score
                FROM document_similarity_embedding e
                JOIN "Document" d ON d.id = e.document_id
                CROSS JOIN query q
                WHERE d."deletedAt" IS NULL
                  AND d."fileType" = 'md'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM document_sub_type dst
                    WHERE dst.document_id = d.id
                  )
                  AND ($4::text IS NULL OR e.document_id <> $4)
                  AND (
                    d.owner = $3
                    OR EXISTS (
                        SELECT 1
                        FROM entity_access ea
                        WHERE ea.entity_id::text = e.document_id
                          AND ea.entity_type = 'document'
                          AND (
                            (ea.source_type = 'user' AND ea.source_id = $3)
                            OR (
                                $5::text IS NOT NULL
                                AND ea.source_type = 'team'
                                AND ea.source_id = $5
                            )
                          )
                    )
                  )
                GROUP BY e.document_id, e.search_key, e.content, e.embedding
            ),
            ranked AS (
                SELECT document_id, MAX(score) AS best
                FROM scored
                GROUP BY document_id
                ORDER BY best DESC
                LIMIT $6
            )
            SELECT
                s.document_id AS "document_id!",
                s.search_key AS "search_key!",
                s.content AS "content!",
                s.embedding_text AS "embedding_text!",
                s.score AS "score!"
            FROM scored s
            JOIN ranked r ON r.document_id = s.document_id
            ORDER BY r.best DESC, s.document_id, s.score DESC
            "#,
            &query_keys,
            &query_vectors,
            params.user,
            params.exclude_document_id,
            team_id,
            params.limit,
        )
        .fetch_all(&mut *tx)
        .await?;
        tx.commit().await?;

        // Group the flat (document_id, field) rows into one SearchResults per
        // entity, preserving the best-first order established by the query.
        let mut results: Vec<SearchResults<String, DIMS>> = Vec::new();
        for row in rows {
            let Some(search_key) = search_key_static(&row.search_key) else {
                tracing::warn!(
                    search_key = %row.search_key,
                    document_id = %row.document_id,
                    "skipping document embedding row with unknown search_key"
                );
                continue;
            };
            let embedding = parse_vector(&row.embedding_text)
                .with_context(|| format!("invalid stored embedding for {}", row.document_id))?;
            let matched = Match {
                score: row.score,
                embedding: LabeledEmbedding {
                    search_key,
                    content: Content::Owned(row.content),
                    embedding,
                },
            };
            match results.last_mut() {
                Some(last) if last.metadata == row.document_id => last.matches.push(matched),
                _ => results.push(SearchResults {
                    metadata: row.document_id,
                    matches: vec![matched],
                }),
            }
        }
        Ok(results)
    }
}

#[async_trait]
impl DocumentNameRepo for PgDocumentVectorDb {
    async fn document_names(
        &self,
        document_ids: &[String],
    ) -> Result<HashMap<String, String>, TaskDedupError> {
        if document_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows = sqlx::query!(
            r#"
            SELECT id, name
            FROM "Document"
            WHERE id = ANY($1)
              AND "deletedAt" IS NULL
            "#,
            document_ids,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|row| (row.id, row.name)).collect())
    }
}
