-- Favorites: a user's personal ordered collection of entities.
CREATE TABLE favorite
(
    id            UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    owner_user_id TEXT             NOT NULL REFERENCES "User" (id) ON DELETE CASCADE,
    entity_type   TEXT             NOT NULL,
    entity_id     TEXT             NOT NULL,
    sort_order    DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- One favorite per entity per user.
CREATE UNIQUE INDEX favorite_user_entity_uq
    ON favorite (owner_user_id, entity_type, entity_id);

-- Ordered listing per user.
CREATE INDEX favorite_user_sort_idx ON favorite (owner_user_id, sort_order);

-- Reverse lookup: "is this entity favorited?" checks by (entity_type, entity_id).
CREATE INDEX favorite_entity_idx ON favorite (entity_type, entity_id);
