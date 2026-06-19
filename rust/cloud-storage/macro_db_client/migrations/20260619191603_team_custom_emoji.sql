-- Custom emoji uploaded per team. The image bytes live in the static file
-- service; this row links a team + slug to the SFS file. Team members type the
-- slug; the immutable `id` is what messages reference, so an emoji renders for
-- anyone who receives it (render-on-encounter) regardless of team.
CREATE TABLE public.team_custom_emoji (
    id          uuid NOT NULL,
    team_id     uuid NOT NULL,
    slug        character varying(32) NOT NULL,
    sfs_file_id text NOT NULL,
    created_by  text NOT NULL,
    created_at  timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at  timestamp with time zone,
    CONSTRAINT team_custom_emoji_pkey PRIMARY KEY (id),
    CONSTRAINT team_custom_emoji_slug_format
        CHECK ((slug)::text ~ '^[a-z0-9][a-z0-9_-]*$'),
    CONSTRAINT team_custom_emoji_team_id_fkey
        FOREIGN KEY (team_id) REFERENCES public.team(id) ON DELETE CASCADE
);

-- One active emoji per (team, slug); a slug frees up again after a soft-delete.
CREATE UNIQUE INDEX team_custom_emoji_team_slug_active_uidx
    ON public.team_custom_emoji (team_id, slug)
    WHERE deleted_at IS NULL;

-- Team-scoped lookups for the autocomplete list.
CREATE INDEX team_custom_emoji_team_id_idx
    ON public.team_custom_emoji (team_id)
    WHERE deleted_at IS NULL;
