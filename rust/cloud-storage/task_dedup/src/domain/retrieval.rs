//! Vector-retrieval helpers shared by task duplicate detection and document
//! similarity search: collapsing per-field search results into scored
//! candidates and reranking them against the query text.

use std::collections::HashMap;

use embedding::{Content, RerankModel, SearchResults};

use super::models::TaskDedupError;

/// A candidate entity surfaced by vector retrieval, collapsed from the
/// per-field [`SearchResults`] into a single score and a reconstructed text
/// used for reranking and judging.
pub(crate) struct Candidate {
    pub(crate) document_id: String,
    /// The candidate's stored field contents joined back together.
    pub(crate) content: String,
    /// Best cosine similarity across the query × stored field cross-product.
    pub(crate) vector_score: f64,
}

/// Collapses a single entity's per-field [`SearchResults`] into a
/// [`Candidate`]: the vector score is the best similarity across the query ×
/// stored-field cross-product, and the content is the entity's matched field
/// texts joined back together for judging. Returns `None` when the entity
/// falls below `min_vector_similarity`.
pub(crate) fn collapse<const DIMS: usize>(
    result: &SearchResults<String, DIMS>,
    min_vector_similarity: f64,
) -> Option<Candidate> {
    let vector_score = result
        .matches
        .iter()
        .map(|matched| matched.score as f64)
        .fold(f64::NEG_INFINITY, f64::max);
    if !vector_score.is_finite() || vector_score < min_vector_similarity {
        return None;
    }
    let content = result
        .matches
        .iter()
        .map(|matched| matched.embedding.content.as_ref())
        .collect::<Vec<_>>()
        .join("\n");
    Some(Candidate {
        document_id: result.metadata.clone(),
        content,
        vector_score,
    })
}

/// Drops results below the similarity floor, reranks the survivors against
/// `query`, and returns them as [`Candidate`]s (paired with their rerank
/// score) ordered by descending relevance. The reranker only carries each
/// result's `document_id` through, so the collapsed content and vector score
/// are looked back up afterwards. An empty survivor set skips the reranker
/// entirely.
pub(crate) async fn rerank<const DIMS: usize, R>(
    reranker: &R,
    query: &str,
    results: Vec<SearchResults<String, DIMS>>,
    min_vector_similarity: f64,
) -> Result<Vec<(Candidate, f32)>, TaskDedupError>
where
    R: RerankModel<DIMS> + Send + Sync,
{
    let mut lookup: HashMap<String, Candidate> = HashMap::new();
    let mut survivors: Vec<SearchResults<String, DIMS>> = Vec::new();
    for result in results {
        let Some(candidate) = collapse(&result, min_vector_similarity) else {
            continue;
        };
        lookup.insert(candidate.document_id.clone(), candidate);
        survivors.push(result);
    }

    if survivors.is_empty() {
        return Ok(Vec::new());
    }

    let reranked = reranker
        .rerank(Content::Borrowed(query), survivors)
        .await
        .map_err(TaskDedupError::Dependency)?;

    Ok(reranked
        .into_iter()
        .filter_map(|scored| {
            lookup
                .remove(&scored.item)
                .map(|candidate| (candidate, scored.score))
        })
        .collect())
}

/// Builds the full entity text used as the rerank/judge query, joining the
/// title and body the same way they read to a user.
pub(crate) fn full_text(title: &str, markdown: &str) -> String {
    format!("{}\n{}", title.trim(), markdown.trim())
}
