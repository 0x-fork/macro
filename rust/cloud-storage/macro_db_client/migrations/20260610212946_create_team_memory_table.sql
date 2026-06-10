-- Team-level memory, one row per team (mirrors the per-user memory table).
CREATE TABLE team_memory (
    id UUID PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES team (id) ON DELETE CASCADE,
    memory TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT team_memory_team_id_unique UNIQUE (team_id)
);
