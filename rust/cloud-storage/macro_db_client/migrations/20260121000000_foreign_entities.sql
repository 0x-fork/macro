-- Add migration script here
-- Create foreign_entities table for storing references to external entities

CREATE TABLE IF NOT EXISTS public.foreign_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The full namespaced identifier (for indexing and queries)
    "namespacedIdentifier" TEXT NOT NULL,

    -- Parsed components (stored as array for path)
    path TEXT[] NOT NULL,
    identifier TEXT NOT NULL,

    -- Metadata
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint: one foreign entity per namespaced identifier
    CONSTRAINT "unique_namespaced_identifier" UNIQUE ("namespacedIdentifier")
);

-- Index for efficient lookups by namespaced identifier
CREATE INDEX IF NOT EXISTS "idx_foreign_entities_namespaced_identifier"
    ON public.foreign_entities("namespacedIdentifier");

-- GIN index for path prefix queries (e.g., all discord::* entities)
CREATE INDEX IF NOT EXISTS "idx_foreign_entities_path"
    ON public.foreign_entities USING GIN(path);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_foreign_entities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trigger_update_foreign_entities_updated_at"
    BEFORE UPDATE ON public.foreign_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_foreign_entities_updated_at();
