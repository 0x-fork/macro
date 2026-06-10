-- Team-level memory lives in the existing memory table: each row is scoped to
-- either a user (personal memory) or a team (team memory), exactly one of the two.
ALTER TABLE memory ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE memory ADD COLUMN team_id UUID REFERENCES team (id) ON DELETE CASCADE;
ALTER TABLE memory ADD CONSTRAINT memory_user_or_team CHECK (num_nonnulls(user_id, team_id) = 1);

-- Replace the plain unique constraint with partial unique indexes so both
-- scopes keep one-row-per-owner upsert semantics.
ALTER TABLE memory DROP CONSTRAINT memory_user_id_unique;
CREATE UNIQUE INDEX memory_user_id_unique ON memory (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX memory_team_id_unique ON memory (team_id) WHERE team_id IS NOT NULL;
