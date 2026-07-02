-- Favorites: user- and team-scoped ordered collections of entities.
-- A favorite is owned by exactly one of (owner_user_id, owner_team_id).
CREATE TABLE favorite
(
    id            UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    owner_user_id TEXT REFERENCES "User" (id) ON DELETE CASCADE,
    owner_team_id UUID REFERENCES "team" (id) ON DELETE CASCADE,
    entity_type   TEXT             NOT NULL,
    entity_id     TEXT             NOT NULL,
    sort_order    DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_by    TEXT             NOT NULL REFERENCES "User" (id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
    CONSTRAINT favorite_exactly_one_owner CHECK (num_nonnulls(owner_user_id, owner_team_id) = 1)
);

-- One favorite per entity per owner (partial indexes because owner columns are nullable).
CREATE UNIQUE INDEX favorite_user_entity_uq
    ON favorite (owner_user_id, entity_type, entity_id)
    WHERE owner_user_id IS NOT NULL;

CREATE UNIQUE INDEX favorite_team_entity_uq
    ON favorite (owner_team_id, entity_type, entity_id)
    WHERE owner_team_id IS NOT NULL;

-- Ordered listing per owner.
CREATE INDEX favorite_user_sort_idx ON favorite (owner_user_id, sort_order) WHERE owner_user_id IS NOT NULL;
CREATE INDEX favorite_team_sort_idx ON favorite (owner_team_id, sort_order) WHERE owner_team_id IS NOT NULL;

-- Reverse lookup: "is this entity favorited?" checks by (entity_type, entity_id).
CREATE INDEX favorite_entity_idx ON favorite (entity_type, entity_id);
