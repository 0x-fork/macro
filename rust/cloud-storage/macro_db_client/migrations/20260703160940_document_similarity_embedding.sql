-- Embedding store for the "similar documents" surface. Mirrors
-- task_duplicate_embedding (one row per (document_id, search_key) field) but
-- holds plain markdown documents instead of tasks so document similarity search
-- does not pollute task duplicate detection, and vice versa.
CREATE TABLE document_similarity_embedding (
    document_id TEXT NOT NULL,
    search_key TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (document_id, search_key)
);

-- HNSW pairs with pgvector iterative index scans for filtered queries (the
-- search filters by owner/access after the index scan). Enable iterative scans
-- at query time, e.g. per transaction:
--   SET LOCAL hnsw.iterative_scan = relaxed_order;
CREATE INDEX document_similarity_embedding_vector_idx
    ON document_similarity_embedding
    USING hnsw (embedding vector_cosine_ops);
