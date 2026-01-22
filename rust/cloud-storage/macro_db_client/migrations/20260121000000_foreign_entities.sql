-- Add migration script here
-- Create foreign_entities table for storing references to external entities

CREATE TABLE IF NOT EXISTS public.foreign_entities (
    id UUID PRIMARY KEY,

    -- The full namespaced identifier (for indexing and queries)
    namespaced_identifier TEXT NOT NULL,

    -- Parsed components (stored as array for path)
    path TEXT[] NOT NULL,
    identifier TEXT NOT NULL,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint: one foreign entity per namespaced identifier
    CONSTRAINT unique_namespaced_identifier UNIQUE (namespaced_identifier)
);

-- Index for efficient lookups by namespaced identifier
CREATE INDEX IF NOT EXISTS idx_foreign_entities_namespaced_identifier
    ON public.foreign_entities(namespaced_identifier);

-- GIN index for path prefix queries (e.g., all discord::* entities)
CREATE INDEX IF NOT EXISTS idx_foreign_entities_path
    ON public.foreign_entities USING GIN(path);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_foreign_entities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_foreign_entities_updated_at
    BEFORE UPDATE ON public.foreign_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_foreign_entities_updated_at();
