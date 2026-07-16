//! MacroDB-backed [`DocumentationRepository`].

#[cfg(test)]
mod test;

use sqlx::PgPool;

use crate::domain::{
    model::{
        BuildStatus, CustomDomain, DocumentationError, DocumentationSite, NavNode, NavNodeKind,
        PagePath, SiteBuild, SiteSlug,
    },
    ports::DocumentationRepository,
};

/// Unique constraint on `documentation_site.slug`.
const SLUG_UNIQUE_CONSTRAINT: &str = "documentation_site_slug_unique";
/// Unique constraint on `documentation_site.custom_domain`.
const DOMAIN_UNIQUE_CONSTRAINT: &str = "documentation_site_custom_domain_unique";
/// Unique index on `documentation_nav_node (site_id, path)`.
const PATH_UNIQUE_CONSTRAINT: &str = "documentation_nav_node_site_path_unique";

/// MacroDB-backed [`DocumentationRepository`].
#[derive(Clone, Debug)]
pub struct DocumentationRepositoryImpl {
    pool: PgPool,
}

impl DocumentationRepositoryImpl {
    /// Creates a new repository wrapping the given macrodb pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

/// Maps a unique-constraint violation to its domain error; everything else
/// becomes [`DocumentationError::Internal`].
fn map_db_error(err: sqlx::Error) -> DocumentationError {
    if let sqlx::Error::Database(ref db_err) = err
        && db_err.is_unique_violation()
    {
        match db_err.constraint() {
            Some(SLUG_UNIQUE_CONSTRAINT) => return DocumentationError::SlugTaken,
            Some(DOMAIN_UNIQUE_CONSTRAINT) => return DocumentationError::DomainTaken,
            Some(PATH_UNIQUE_CONSTRAINT) => return DocumentationError::PathTaken,
            _ => {}
        }
    }
    DocumentationError::Internal(rootcause::report!("documentation db error: {err}"))
}

/// Row shape shared by every `documentation_site` SELECT/RETURNING.
struct SiteRow {
    id: uuid::Uuid,
    team_id: uuid::Uuid,
    user_id: String,
    name: String,
    slug: String,
    custom_domain: Option<String>,
    published_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<SiteRow> for DocumentationSite {
    fn from(row: SiteRow) -> Self {
        Self {
            id: row.id,
            team_id: row.team_id,
            user_id: row.user_id,
            name: row.name,
            slug: SiteSlug::from_trusted(row.slug),
            custom_domain: row.custom_domain.map(CustomDomain::from_trusted),
            published_at: row.published_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

/// Row shape shared by every `documentation_nav_node` SELECT/RETURNING.
struct NavNodeRow {
    id: uuid::Uuid,
    site_id: uuid::Uuid,
    parent_id: Option<uuid::Uuid>,
    kind: NavNodeKind,
    title: String,
    path: Option<String>,
    document_id: Option<String>,
    position: i32,
}

impl From<NavNodeRow> for NavNode {
    fn from(row: NavNodeRow) -> Self {
        Self {
            id: row.id,
            site_id: row.site_id,
            parent_id: row.parent_id,
            kind: row.kind,
            title: row.title,
            path: row.path.map(PagePath::from_trusted),
            document_id: row.document_id,
            position: row.position,
        }
    }
}

impl DocumentationRepository for DocumentationRepositoryImpl {
    #[tracing::instrument(skip(self, site), err)]
    async fn create_site(&self, site: &DocumentationSite) -> Result<(), DocumentationError> {
        sqlx::query!(
            r#"
            INSERT INTO documentation_site
                (id, team_id, user_id, name, slug, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
            site.id,
            site.team_id,
            site.user_id,
            site.name,
            site.slug.as_str(),
            site.created_at,
            site.updated_at,
        )
        .execute(&self.pool)
        .await
        .map_err(map_db_error)?;
        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_site(
        &self,
        site_id: &uuid::Uuid,
    ) -> Result<Option<DocumentationSite>, DocumentationError> {
        let row = sqlx::query_as!(
            SiteRow,
            r#"
            SELECT id, team_id, user_id, name, slug, custom_domain,
                published_at, created_at, updated_at
            FROM documentation_site
            WHERE id = $1
            "#,
            site_id,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(map_db_error)?;
        Ok(row.map(Into::into))
    }

    #[tracing::instrument(skip(self), err)]
    async fn list_sites_for_team(
        &self,
        team_id: &uuid::Uuid,
    ) -> Result<Vec<DocumentationSite>, DocumentationError> {
        let rows = sqlx::query_as!(
            SiteRow,
            r#"
            SELECT id, team_id, user_id, name, slug, custom_domain,
                published_at, created_at, updated_at
            FROM documentation_site
            WHERE team_id = $1
            ORDER BY created_at DESC, id DESC
            "#,
            team_id,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(map_db_error)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    #[tracing::instrument(skip(self), err)]
    async fn update_site(
        &self,
        site_id: &uuid::Uuid,
        name: Option<&str>,
        slug: Option<&SiteSlug>,
    ) -> Result<DocumentationSite, DocumentationError> {
        let row = sqlx::query_as!(
            SiteRow,
            r#"
            UPDATE documentation_site
            SET name       = COALESCE($2, name),
                slug       = COALESCE($3, slug),
                updated_at = now()
            WHERE id = $1
            RETURNING id, team_id, user_id, name, slug, custom_domain,
                published_at, created_at, updated_at
            "#,
            site_id,
            name,
            slug.map(|s| s.as_str()),
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(map_db_error)?
        .ok_or(DocumentationError::SiteNotFound)?;
        Ok(row.into())
    }

    #[tracing::instrument(skip(self), err)]
    async fn set_custom_domain(
        &self,
        site_id: &uuid::Uuid,
        domain: Option<&CustomDomain>,
    ) -> Result<DocumentationSite, DocumentationError> {
        let row = sqlx::query_as!(
            SiteRow,
            r#"
            UPDATE documentation_site
            SET custom_domain = $2,
                updated_at    = now()
            WHERE id = $1
            RETURNING id, team_id, user_id, name, slug, custom_domain,
                published_at, created_at, updated_at
            "#,
            site_id,
            domain.map(|d| d.as_str()),
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(map_db_error)?
        .ok_or(DocumentationError::SiteNotFound)?;
        Ok(row.into())
    }

    #[tracing::instrument(skip(self), err)]
    async fn delete_site(&self, site_id: &uuid::Uuid) -> Result<(), DocumentationError> {
        sqlx::query!(r#"DELETE FROM documentation_site WHERE id = $1"#, site_id)
            .execute(&self.pool)
            .await
            .map_err(map_db_error)?;
        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn set_site_published_at(
        &self,
        site_id: &uuid::Uuid,
        published_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), DocumentationError> {
        sqlx::query!(
            r#"
            UPDATE documentation_site
            SET published_at = $2, updated_at = now()
            WHERE id = $1
            "#,
            site_id,
            published_at,
        )
        .execute(&self.pool)
        .await
        .map_err(map_db_error)?;
        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn list_nav_nodes(
        &self,
        site_id: &uuid::Uuid,
    ) -> Result<Vec<NavNode>, DocumentationError> {
        let rows = sqlx::query_as!(
            NavNodeRow,
            r#"
            SELECT id, site_id, parent_id, kind AS "kind: NavNodeKind",
                title, path, document_id, position
            FROM documentation_nav_node
            WHERE site_id = $1
            ORDER BY position ASC, created_at ASC
            "#,
            site_id,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(map_db_error)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    #[tracing::instrument(skip(self, node), err)]
    async fn create_nav_node(&self, node: &NavNode) -> Result<NavNode, DocumentationError> {
        let row = sqlx::query_as!(
            NavNodeRow,
            r#"
            INSERT INTO documentation_nav_node
                (id, site_id, parent_id, kind, title, path, document_id, position)
            VALUES ($1, $2, $3, $4, $5, $6, $7, (
                SELECT COALESCE(MAX(position) + 1, 0)
                FROM documentation_nav_node
                WHERE site_id = $2 AND parent_id IS NOT DISTINCT FROM $3
            ))
            RETURNING id, site_id, parent_id, kind AS "kind: NavNodeKind",
                title, path, document_id, position
            "#,
            node.id,
            node.site_id,
            node.parent_id,
            node.kind as _,
            node.title,
            node.path.as_ref().map(|p| p.as_str()),
            node.document_id,
        )
        .fetch_one(&self.pool)
        .await
        .map_err(map_db_error)?;
        Ok(row.into())
    }

    #[tracing::instrument(skip(self), err)]
    async fn update_nav_node(
        &self,
        site_id: &uuid::Uuid,
        node_id: &uuid::Uuid,
        title: Option<&str>,
        path: Option<&PagePath>,
    ) -> Result<NavNode, DocumentationError> {
        let row = sqlx::query_as!(
            NavNodeRow,
            r#"
            UPDATE documentation_nav_node
            SET title      = COALESCE($3, title),
                path       = COALESCE($4, path),
                updated_at = now()
            WHERE site_id = $1 AND id = $2
            RETURNING id, site_id, parent_id, kind AS "kind: NavNodeKind",
                title, path, document_id, position
            "#,
            site_id,
            node_id,
            title,
            path.map(|p| p.as_str()),
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(map_db_error)?
        .ok_or(DocumentationError::NodeNotFound)?;
        Ok(row.into())
    }

    #[tracing::instrument(skip(self), err)]
    async fn move_nav_node(
        &self,
        site_id: &uuid::Uuid,
        node_id: &uuid::Uuid,
        new_parent_id: Option<&uuid::Uuid>,
        new_position: i32,
    ) -> Result<(), DocumentationError> {
        let mut tx = self.pool.begin().await.map_err(map_db_error)?;

        let old = sqlx::query!(
            r#"
            SELECT parent_id, position
            FROM documentation_nav_node
            WHERE site_id = $1 AND id = $2
            FOR UPDATE
            "#,
            site_id,
            node_id,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_db_error)?
        .ok_or(DocumentationError::NodeNotFound)?;

        // Remove the node from its old sibling list.
        sqlx::query!(
            r#"
            UPDATE documentation_nav_node
            SET position = position - 1
            WHERE site_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND position > $3
            "#,
            site_id,
            old.parent_id,
            old.position,
        )
        .execute(&mut *tx)
        .await
        .map_err(map_db_error)?;

        // Clamp the target position to the new sibling list's length.
        let sibling_count = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) AS "count!"
            FROM documentation_nav_node
            WHERE site_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND id <> $3
            "#,
            site_id,
            new_parent_id.copied(),
            node_id,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(map_db_error)?;
        let position = new_position.min(i32::try_from(sibling_count).unwrap_or(i32::MAX));

        // Open a gap in the new sibling list.
        sqlx::query!(
            r#"
            UPDATE documentation_nav_node
            SET position = position + 1
            WHERE site_id = $1 AND parent_id IS NOT DISTINCT FROM $2
                AND position >= $3 AND id <> $4
            "#,
            site_id,
            new_parent_id.copied(),
            position,
            node_id,
        )
        .execute(&mut *tx)
        .await
        .map_err(map_db_error)?;

        sqlx::query!(
            r#"
            UPDATE documentation_nav_node
            SET parent_id = $3, position = $4, updated_at = now()
            WHERE site_id = $1 AND id = $2
            "#,
            site_id,
            node_id,
            new_parent_id.copied(),
            position,
        )
        .execute(&mut *tx)
        .await
        .map_err(map_db_error)?;

        tx.commit().await.map_err(map_db_error)?;
        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn delete_nav_node(
        &self,
        site_id: &uuid::Uuid,
        node_id: &uuid::Uuid,
    ) -> Result<(), DocumentationError> {
        let mut tx = self.pool.begin().await.map_err(map_db_error)?;

        let deleted = sqlx::query!(
            r#"
            DELETE FROM documentation_nav_node
            WHERE site_id = $1 AND id = $2
            RETURNING parent_id, position
            "#,
            site_id,
            node_id,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_db_error)?
        .ok_or(DocumentationError::NodeNotFound)?;

        // Close the gap in the sibling list.
        sqlx::query!(
            r#"
            UPDATE documentation_nav_node
            SET position = position - 1
            WHERE site_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND position > $3
            "#,
            site_id,
            deleted.parent_id,
            deleted.position,
        )
        .execute(&mut *tx)
        .await
        .map_err(map_db_error)?;

        tx.commit().await.map_err(map_db_error)?;
        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn document_usable_as_page(&self, document_id: &str) -> Result<bool, DocumentationError> {
        let usable = sqlx::query_scalar!(
            r#"
            SELECT EXISTS (
                SELECT 1
                FROM "Document"
                WHERE id = $1 AND "deletedAt" IS NULL AND "fileType" = 'md'
            ) AS "usable!"
            "#,
            document_id,
        )
        .fetch_one(&self.pool)
        .await
        .map_err(map_db_error)?;
        Ok(usable)
    }

    #[tracing::instrument(skip(self, build), err)]
    async fn create_build(&self, build: &SiteBuild) -> Result<(), DocumentationError> {
        sqlx::query!(
            r#"
            INSERT INTO documentation_site_build
                (id, site_id, user_id, status, created_at)
            VALUES ($1, $2, $3, $4, $5)
            "#,
            build.id,
            build.site_id,
            build.user_id,
            build.status as _,
            build.created_at,
        )
        .execute(&self.pool)
        .await
        .map_err(map_db_error)?;
        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_latest_build(
        &self,
        site_id: &uuid::Uuid,
    ) -> Result<Option<SiteBuild>, DocumentationError> {
        let build = sqlx::query_as!(
            SiteBuild,
            r#"
            SELECT id, site_id, user_id, status AS "status: BuildStatus",
                error, page_count, created_at, finished_at
            FROM documentation_site_build
            WHERE site_id = $1
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            "#,
            site_id,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(map_db_error)?;
        Ok(build)
    }

    #[tracing::instrument(skip(self), err)]
    async fn mark_build_in_progress(
        &self,
        build_id: &uuid::Uuid,
    ) -> Result<(), DocumentationError> {
        sqlx::query!(
            r#"
            UPDATE documentation_site_build
            SET status = 'in_progress'
            WHERE id = $1
            "#,
            build_id,
        )
        .execute(&self.pool)
        .await
        .map_err(map_db_error)?;
        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn mark_build_succeeded(
        &self,
        build_id: &uuid::Uuid,
        page_count: i32,
    ) -> Result<(), DocumentationError> {
        sqlx::query!(
            r#"
            UPDATE documentation_site_build
            SET status = 'succeeded', page_count = $2, finished_at = now()
            WHERE id = $1
            "#,
            build_id,
            page_count,
        )
        .execute(&self.pool)
        .await
        .map_err(map_db_error)?;
        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn mark_build_failed(
        &self,
        build_id: &uuid::Uuid,
        error: &str,
    ) -> Result<(), DocumentationError> {
        sqlx::query!(
            r#"
            UPDATE documentation_site_build
            SET status = 'failed', error = $2, finished_at = now()
            WHERE id = $1
            "#,
            build_id,
            error,
        )
        .execute(&self.pool)
        .await
        .map_err(map_db_error)?;
        Ok(())
    }
}
