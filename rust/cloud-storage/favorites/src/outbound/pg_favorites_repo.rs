//! PostgreSQL implementation of the [`FavoritesRepo`] port.

#[cfg(test)]
mod tests;

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::{Entity, EntityType};
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::models::Favorite;
use crate::domain::ports::FavoritesRepo;

/// Postgres-backed favorites repository.
#[derive(Debug, Clone)]
pub struct PgFavoritesRepo {
    pool: PgPool,
}

impl PgFavoritesRepo {
    /// Create a repository backed by the provided pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

/// Errors produced by the Postgres favorites repository.
#[derive(Debug, thiserror::Error)]
pub enum FavoritesRepoErr {
    /// Underlying database error.
    #[error(transparent)]
    Db(#[from] sqlx::Error),
    /// A stored entity type could not be parsed into [EntityType].
    #[error("invalid entity type stored for favorite: {0}")]
    InvalidEntityType(String),
}

struct FavoriteRow {
    entity_type: String,
    entity_id: String,
    sort_order: f64,
    created_at: DateTime<Utc>,
}

impl FavoriteRow {
    /// Convert to a [Favorite] with no display metadata hydrated.
    fn into_favorite(self) -> Result<Favorite, FavoritesRepoErr> {
        let entity_type: EntityType = self
            .entity_type
            .parse()
            .map_err(|_| FavoritesRepoErr::InvalidEntityType(self.entity_type.clone()))?;
        Ok(Favorite {
            entity_type,
            entity_id: self.entity_id,
            sort_order: self.sort_order,
            created_at: self.created_at,
            name: None,
            file_type: None,
            document_sub_type: None,
            channel_type: None,
            channel_id: None,
        })
    }
}

struct DocumentMeta {
    name: Option<String>,
    file_type: Option<String>,
    sub_type: Option<String>,
}

struct ChannelMeta {
    name: Option<String>,
    channel_type: String,
}

/// Display-metadata hydration for [`PgFavoritesRepo::list_favorites`].
///
/// Each favorited entity type is hydrated with its own batch query keyed on
/// correctly typed ids (`text[]` or `uuid[]`), so every lookup is an index
/// probe on the target table's primary key. Hydrating everything in a single
/// query is a trap here: the id columns of the comms/email tables are `uuid`
/// while `favorite.entity_id` is `text`, and joining them via
/// `big_table.id::text = f.entity_id` puts a cast on the indexed column,
/// which Postgres cannot serve from the index — every favorites list then
/// seq-scans those tables.
impl PgFavoritesRepo {
    /// Uuids parsed from the favorites of the given entity type. Ids that are
    /// not valid uuids cannot exist in a uuid-keyed table, so they are simply
    /// left out (and end up unhydrated, like any other lookup miss).
    fn uuid_ids(rows: &[FavoriteRow], entity_type: &str) -> Vec<Uuid> {
        rows.iter()
            .filter(|r| r.entity_type == entity_type)
            .filter_map(|r| r.entity_id.parse().ok())
            .collect()
    }

    fn text_ids(rows: &[FavoriteRow], entity_type: &str) -> Vec<String> {
        rows.iter()
            .filter(|r| r.entity_type == entity_type)
            .map(|r| r.entity_id.clone())
            .collect()
    }

    /// Live (non-deleted) documents by id. A favorite missing from the map is
    /// deleted or gone and gets dropped from the listing.
    async fn document_meta(
        &self,
        ids: &[String],
    ) -> Result<HashMap<String, DocumentMeta>, FavoritesRepoErr> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows = sqlx::query!(
            r#"
            SELECT
                d.id,
                d.name as "name?",
                d."fileType" as "file_type?",
                dt.sub_type::text as "sub_type?"
            FROM "Document" d
            LEFT JOIN document_sub_type dt ON dt.document_id = d.id
            WHERE d.id = ANY($1) AND d."deletedAt" IS NULL
            "#,
            ids,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| {
                (
                    r.id,
                    DocumentMeta {
                        name: r.name,
                        file_type: r.file_type,
                        sub_type: r.sub_type,
                    },
                )
            })
            .collect())
    }

    /// Live (non-deleted) chat names by id. A favorite missing from the map
    /// is deleted or gone and gets dropped from the listing.
    async fn chat_names(
        &self,
        ids: &[String],
    ) -> Result<HashMap<String, Option<String>>, FavoritesRepoErr> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows = sqlx::query!(
            r#"SELECT id, name as "name?" FROM "Chat" WHERE id = ANY($1) AND "deletedAt" IS NULL"#,
            ids,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| (r.id, r.name)).collect())
    }

    /// Live (non-deleted) project names by id. A favorite missing from the
    /// map is deleted or gone and gets dropped from the listing.
    async fn project_names(
        &self,
        ids: &[String],
    ) -> Result<HashMap<String, Option<String>>, FavoritesRepoErr> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows = sqlx::query!(
            r#"SELECT id, name as "name?" FROM "Project" WHERE id = ANY($1) AND "deletedAt" IS NULL"#,
            ids,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| (r.id, r.name)).collect())
    }

    async fn channel_meta(
        &self,
        ids: &[Uuid],
    ) -> Result<HashMap<Uuid, ChannelMeta>, FavoritesRepoErr> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows = sqlx::query!(
            r#"
            SELECT id, name as "name?", channel_type::text as "channel_type!"
            FROM comms_channels
            WHERE id = ANY($1)
            "#,
            ids,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| {
                (
                    r.id,
                    ChannelMeta {
                        name: r.name,
                        channel_type: r.channel_type,
                    },
                )
            })
            .collect())
    }

    /// Subject of the latest non-draft message per thread.
    async fn email_thread_subjects(
        &self,
        ids: &[Uuid],
    ) -> Result<HashMap<Uuid, Option<String>>, FavoritesRepoErr> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows = sqlx::query!(
            r#"
            SELECT et.id, em.subject as "subject?"
            FROM email_threads et
            LEFT JOIN LATERAL (
                SELECT m.subject
                FROM email_messages m
                WHERE m.thread_id = et.id AND m.is_draft = false
                ORDER BY m.internal_date_ts DESC NULLS LAST
                LIMIT 1
            ) em ON true
            WHERE et.id = ANY($1)
            "#,
            ids,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| (r.id, r.subject)).collect())
    }
}

impl FavoritesRepo for PgFavoritesRepo {
    type Err = FavoritesRepoErr;

    #[tracing::instrument(err, skip(self))]
    async fn add_favorite(
        &self,
        user_id: &MacroUserIdStr<'_>,
        entity: &Entity<'_>,
    ) -> Result<Favorite, Self::Err> {
        let entity_type: &str = entity.entity_type.into();
        let row = sqlx::query_as!(
            FavoriteRow,
            r#"
            INSERT INTO favorite (user_id, entity_type, entity_id, sort_order)
            VALUES (
                $1, $2, $3,
                COALESCE((SELECT MAX(sort_order) + 1 FROM favorite WHERE user_id = $1), 0)
            )
            ON CONFLICT (user_id, entity_type, entity_id)
                DO UPDATE SET updated_at = now()
            RETURNING
                entity_type as "entity_type!",
                entity_id as "entity_id!",
                sort_order as "sort_order!",
                created_at as "created_at!"
            "#,
            user_id.as_ref(),
            entity_type,
            entity.entity_id.as_ref(),
        )
        .fetch_one(&self.pool)
        .await?;
        row.into_favorite()
    }

    #[tracing::instrument(err, skip(self))]
    async fn count_favorites(&self, user_id: &MacroUserIdStr<'_>) -> Result<i64, Self::Err> {
        let count = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!" FROM favorite WHERE user_id = $1"#,
            user_id.as_ref(),
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(count)
    }

    #[tracing::instrument(err, skip(self))]
    async fn list_favorites(
        &self,
        user_id: &MacroUserIdStr<'_>,
    ) -> Result<Vec<Favorite>, Self::Err> {
        // The bare collection first (one probe of favorite_user_sort_idx),
        // then display metadata per entity type — see the hydration impl
        // block above for why this is deliberately not a single query.
        // Favorites whose document/chat/project target is deleted or missing
        // are omitted; other types list even when unhydrated.
        let rows = sqlx::query_as!(
            FavoriteRow,
            r#"
            SELECT entity_type, entity_id, sort_order, created_at
            FROM favorite
            WHERE user_id = $1
            ORDER BY sort_order ASC, created_at ASC
            "#,
            user_id.as_ref(),
        )
        .fetch_all(&self.pool)
        .await?;

        let documents = self
            .document_meta(&Self::text_ids(&rows, "document"))
            .await?;
        let chats = self.chat_names(&Self::text_ids(&rows, "chat")).await?;
        let projects = self
            .project_names(&Self::text_ids(&rows, "project"))
            .await?;
        let channels = self.channel_meta(&Self::uuid_ids(&rows, "channel")).await?;
        let email_subjects = self
            .email_thread_subjects(&Self::uuid_ids(&rows, "email_thread"))
            .await?;

        let mut favorites = Vec::with_capacity(rows.len());
        for row in rows {
            let mut favorite = row.into_favorite()?;
            match favorite.entity_type {
                EntityType::Document => {
                    let Some(meta) = documents.get(&favorite.entity_id) else {
                        continue;
                    };
                    favorite.name = meta.name.clone();
                    favorite.file_type = meta.file_type.clone();
                    favorite.document_sub_type = meta.sub_type.clone();
                }
                EntityType::Chat => {
                    let Some(name) = chats.get(&favorite.entity_id) else {
                        continue;
                    };
                    favorite.name = name.clone();
                }
                EntityType::Project => {
                    let Some(name) = projects.get(&favorite.entity_id) else {
                        continue;
                    };
                    favorite.name = name.clone();
                }
                EntityType::Channel => {
                    if let Some(meta) = favorite
                        .entity_id
                        .parse::<Uuid>()
                        .ok()
                        .and_then(|id| channels.get(&id))
                    {
                        favorite.name = meta.name.clone();
                        favorite.channel_type = Some(meta.channel_type.clone());
                    }
                }
                EntityType::EmailThread => {
                    favorite.name = favorite
                        .entity_id
                        .parse::<Uuid>()
                        .ok()
                        .and_then(|id| email_subjects.get(&id))
                        .cloned()
                        .flatten();
                }
                _ => {}
            }
            favorites.push(favorite);
        }
        Ok(favorites)
    }

    #[tracing::instrument(err, skip(self))]
    async fn remove_favorite_by_entity(
        &self,
        user_id: &MacroUserIdStr<'_>,
        entity: &Entity<'_>,
    ) -> Result<bool, Self::Err> {
        let entity_type: &str = entity.entity_type.into();
        let res = sqlx::query!(
            r#"
            DELETE FROM favorite
            WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3
            "#,
            user_id.as_ref(),
            entity_type,
            entity.entity_id.as_ref(),
        )
        .execute(&self.pool)
        .await?;
        Ok(res.rows_affected() > 0)
    }

    #[tracing::instrument(err, skip(self, ordered))]
    async fn reorder_favorites(
        &self,
        user_id: &MacroUserIdStr<'_>,
        ordered: &[Entity<'_>],
    ) -> Result<(), Self::Err> {
        let (entity_types, entity_ids): (Vec<String>, Vec<String>) = ordered
            .iter()
            .map(|e| {
                (
                    <&str>::from(e.entity_type).to_string(),
                    e.entity_id.to_string(),
                )
            })
            .unzip();
        sqlx::query!(
            r#"
            UPDATE favorite f
            SET sort_order = x.ord::float8 - 1, updated_at = now()
            FROM UNNEST($2::text[], $3::text[]) WITH ORDINALITY AS x(entity_type, entity_id, ord)
            WHERE f.user_id = $1
              AND f.entity_type = x.entity_type
              AND f.entity_id = x.entity_id
            "#,
            user_id.as_ref(),
            &entity_types,
            &entity_ids,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    #[tracing::instrument(err, skip(self, entities))]
    async fn favorited_entities(
        &self,
        user_id: &MacroUserIdStr<'_>,
        entities: &[Entity<'_>],
    ) -> Result<HashSet<Entity<'static>>, Self::Err> {
        let (entity_types, entity_ids): (Vec<String>, Vec<String>) = entities
            .iter()
            .map(|e| {
                (
                    <&str>::from(e.entity_type).to_string(),
                    e.entity_id.to_string(),
                )
            })
            .unzip();

        let rows = sqlx::query!(
            r#"
            SELECT DISTINCT f.entity_type as "entity_type!", f.entity_id as "entity_id!"
            FROM favorite f
            JOIN UNNEST($2::text[], $3::text[]) AS w(entity_type, entity_id)
              ON w.entity_type = f.entity_type AND w.entity_id = f.entity_id
            WHERE f.user_id = $1
            "#,
            user_id.as_ref(),
            &entity_types,
            &entity_ids,
        )
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|r| {
                let entity_type: EntityType = r
                    .entity_type
                    .parse()
                    .map_err(|_| FavoritesRepoErr::InvalidEntityType(r.entity_type.clone()))?;
                Ok(entity_type.with_entity_string(r.entity_id))
            })
            .collect()
    }
}
