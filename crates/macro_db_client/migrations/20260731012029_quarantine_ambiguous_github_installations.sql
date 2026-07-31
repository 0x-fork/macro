-- Quarantine installations whose GitHub identity or Macro source is
-- ambiguous. Pull-request foreign entities are derived cache data, so remove
-- affected rows rather than risk retaining cross-tenant metadata.
WITH installation_resolution AS (
    SELECT
        installation.id AS installation_id,
        COUNT(DISTINCT installation.source_id || ':' || installation.source_type::text)
            AS source_count,
        MIN(installation.source_id) AS source_id,
        MIN(installation.source_type::text) AS source_type,
        COUNT(DISTINCT links.macro_id) AS macro_user_count,
        MIN(links.macro_id) AS macro_user_id,
        COUNT(DISTINCT membership.team_id) AS team_count,
        MIN(membership.team_id::text) AS team_id
    FROM github_app_installation installation
    LEFT JOIN github_app_installation_installer installer
        ON installer.installation_id = installation.id
    LEFT JOIN github_links links
        ON links.github_user_id = installer.github_user_id
    LEFT JOIN team_user membership
        ON membership.user_id = links.macro_id
    GROUP BY installation.id
),
ambiguous_installations AS (
    SELECT installation_id
    FROM installation_resolution
    WHERE source_count <> 1
       OR macro_user_count <> 1
       OR team_count > 1
       OR (
            team_count = 0
            AND (source_type <> 'user' OR source_id <> macro_user_id)
       )
       OR (
            team_count = 1
            AND (source_type <> 'team' OR source_id <> team_id)
       )
),
ambiguous_sources AS (
    SELECT DISTINCT installation.source_id, installation.source_type::text
    FROM github_app_installation installation
    JOIN ambiguous_installations ambiguous
        ON ambiguous.installation_id = installation.id
)
DELETE FROM foreign_entity entity
USING ambiguous_sources source
WHERE entity.foreign_entity_source = 'github_pull_request'
  AND entity.stored_for_id = source.source_id
  AND entity.stored_for_auth_entity = source.source_type;

WITH installation_resolution AS (
    SELECT
        installation.id AS installation_id,
        COUNT(DISTINCT installation.source_id || ':' || installation.source_type::text)
            AS source_count,
        MIN(installation.source_id) AS source_id,
        MIN(installation.source_type::text) AS source_type,
        COUNT(DISTINCT links.macro_id) AS macro_user_count,
        MIN(links.macro_id) AS macro_user_id,
        COUNT(DISTINCT membership.team_id) AS team_count,
        MIN(membership.team_id::text) AS team_id
    FROM github_app_installation installation
    LEFT JOIN github_app_installation_installer installer
        ON installer.installation_id = installation.id
    LEFT JOIN github_links links
        ON links.github_user_id = installer.github_user_id
    LEFT JOIN team_user membership
        ON membership.user_id = links.macro_id
    GROUP BY installation.id
),
ambiguous_installations AS (
    SELECT installation_id
    FROM installation_resolution
    WHERE source_count <> 1
       OR macro_user_count <> 1
       OR team_count > 1
       OR (
            team_count = 0
            AND (source_type <> 'user' OR source_id <> macro_user_id)
       )
       OR (
            team_count = 1
            AND (source_type <> 'team' OR source_id <> team_id)
       )
)
DELETE FROM github_app_installation installation
USING ambiguous_installations ambiguous
WHERE installation.id = ambiguous.installation_id;
