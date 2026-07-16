-- Documentation: team-authored docs sites published as static websites.
--
-- team_documentation_settings mirrors team_crm_settings: a 1:1 row per team
-- holding the team-level enable/disable toggle for the Documentation feature.
CREATE TABLE IF NOT EXISTS team_documentation_settings
(
    team_id               UUID        PRIMARY KEY NOT NULL REFERENCES team (id) ON DELETE CASCADE,
    documentation_enabled BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A documentation site: a team-owned, published collection of markdown
-- documents. `slug` is the site's globally-unique public URL segment
-- (https://<docs host>/<slug>/...). `custom_domain` is an optional custom
-- host (e.g. docs.macro.com) the site can additionally be served from.
CREATE TABLE documentation_site
(
    id            UUID        PRIMARY KEY, -- app-generated UUIDv7
    team_id       UUID        NOT NULL REFERENCES team (id) ON DELETE CASCADE,
    user_id       TEXT        NOT NULL, -- creator
    name          TEXT        NOT NULL,
    slug          TEXT        NOT NULL,
    custom_domain TEXT,
    published_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT documentation_site_slug_unique UNIQUE (slug),
    CONSTRAINT documentation_site_custom_domain_unique UNIQUE (custom_domain)
);

CREATE INDEX documentation_site_team_id_idx ON documentation_site (team_id);

-- Nav tree nodes. A site's navigation is an ordered tree: `group` nodes are
-- display-only section labels; `page` nodes bind a URL path within the site
-- to a markdown "Document". `position` orders siblings (0-based, dense).
CREATE TYPE documentation_nav_node_kind AS ENUM ('group', 'page');

CREATE TABLE documentation_nav_node
(
    id          UUID                         PRIMARY KEY, -- app-generated UUIDv7
    site_id     UUID                         NOT NULL REFERENCES documentation_site (id) ON DELETE CASCADE,
    parent_id   UUID                         REFERENCES documentation_nav_node (id) ON DELETE CASCADE,
    kind        documentation_nav_node_kind  NOT NULL,
    title       TEXT                         NOT NULL,
    path        TEXT,
    document_id TEXT                         REFERENCES "Document" (id) ON DELETE CASCADE,
    position    INTEGER                      NOT NULL,
    created_at  TIMESTAMPTZ                  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ                  NOT NULL DEFAULT now(),
    -- Pages carry a path + document; groups carry neither.
    CONSTRAINT documentation_nav_node_kind_shape CHECK (
        (kind = 'page' AND path IS NOT NULL AND document_id IS NOT NULL)
            OR (kind = 'group' AND path IS NULL AND document_id IS NULL)
    )
);

CREATE UNIQUE INDEX documentation_nav_node_site_path_unique
    ON documentation_nav_node (site_id, path)
    WHERE path IS NOT NULL;
CREATE INDEX documentation_nav_node_site_id_idx ON documentation_nav_node (site_id);
CREATE INDEX documentation_nav_node_parent_id_idx ON documentation_nav_node (parent_id);
CREATE INDEX documentation_nav_node_document_id_idx ON documentation_nav_node (document_id);

-- One row per publish. The published static site in object storage is the
-- artifact; this table is the audit/status record the UI polls.
CREATE TYPE documentation_build_status AS ENUM ('pending', 'in_progress', 'succeeded', 'failed');

CREATE TABLE documentation_site_build
(
    id          UUID                       PRIMARY KEY, -- app-generated UUIDv7
    site_id     UUID                       NOT NULL REFERENCES documentation_site (id) ON DELETE CASCADE,
    user_id     TEXT                       NOT NULL, -- who triggered the publish
    status      documentation_build_status NOT NULL DEFAULT 'pending',
    error       TEXT,
    page_count  INTEGER,
    created_at  TIMESTAMPTZ                NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX documentation_site_build_site_id_created_at_idx
    ON documentation_site_build (site_id, created_at DESC);
