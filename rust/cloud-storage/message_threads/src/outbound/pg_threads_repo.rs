//! Postgres implementation of [`ThreadRepo`] over `comms_messages`,
//! `comms_thread_details`, and the message sidecar tables.
//!
//! Every parent read filters on
//! `COALESCE(parent_type, 'channel')` / `COALESCE(parent_id, channel_id::text)`:
//! the parent columns are still nullable (NULL = legacy channel row, see the
//! `message_parent_entity` migration), and the expression indexes match this
//! exact form.

use std::collections::HashMap;

use anyhow::Context;
use channel_sender::ChannelSender;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::models::{
    CountedReaction, LegacyThreadRef, ResolvedThreadMessage, ThreadAttachment, ThreadMention,
    ThreadMessageRow, ThreadParent, TopLevelThreadRow,
};
use crate::domain::ports::ThreadRepo;

/// Postgres-backed thread repository.
#[derive(Clone)]
pub struct PgThreadsRepo {
    pool: PgPool,
}

impl PgThreadsRepo {
    /// Create a repo over the macrodb pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

struct TopLevelRowDb {
    id: Uuid,
    parent_type: String,
    parent_id: String,
    thread_id: Option<Uuid>,
    sender_id: String,
    triggered_by_user_id: Option<String>,
    content: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    edited_at: Option<DateTime<Utc>>,
    deleted_at: Option<DateTime<Utc>>,
    reply_count: i64,
    latest_reply_at: Option<DateTime<Utc>>,
    resolved: bool,
    mark_id: Option<String>,
}

impl From<TopLevelRowDb> for TopLevelThreadRow {
    fn from(row: TopLevelRowDb) -> Self {
        TopLevelThreadRow {
            message: ThreadMessageRow {
                id: row.id,
                parent_type: row.parent_type,
                parent_id: row.parent_id,
                thread_id: row.thread_id,
                sender_id: row.sender_id,
                triggered_by: row.triggered_by_user_id,
                content: row.content,
                created_at: row.created_at,
                updated_at: row.updated_at,
                edited_at: row.edited_at,
                deleted_at: row.deleted_at,
            },
            reply_count: row.reply_count,
            latest_reply_at: row.latest_reply_at,
            resolved: row.resolved,
            mark_id: row.mark_id,
        }
    }
}

struct MessageRowDb {
    id: Uuid,
    parent_type: String,
    parent_id: String,
    thread_id: Option<Uuid>,
    sender_id: String,
    triggered_by_user_id: Option<String>,
    content: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    edited_at: Option<DateTime<Utc>>,
    deleted_at: Option<DateTime<Utc>>,
}

impl From<MessageRowDb> for ThreadMessageRow {
    fn from(row: MessageRowDb) -> Self {
        ThreadMessageRow {
            id: row.id,
            parent_type: row.parent_type,
            parent_id: row.parent_id,
            thread_id: row.thread_id,
            sender_id: row.sender_id,
            triggered_by: row.triggered_by_user_id,
            content: row.content,
            created_at: row.created_at,
            updated_at: row.updated_at,
            edited_at: row.edited_at,
            deleted_at: row.deleted_at,
        }
    }
}

impl ThreadRepo for PgThreadsRepo {
    type Err = anyhow::Error;

    #[tracing::instrument(err, skip(self, content))]
    async fn create_message(
        &self,
        parent: &ThreadParent,
        sender: ChannelSender<'_>,
        content: String,
        thread_id: Option<Uuid>,
    ) -> Result<ThreadMessageRow, Self::Err> {
        let message_id = macro_uuid::generate_uuid_v7();
        let row = sqlx::query_as!(
            MessageRowDb,
            r#"
            INSERT INTO comms_messages (id, channel_id, parent_type, parent_id, sender_id, content, thread_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
                id,
                COALESCE(parent_type, 'channel') AS "parent_type!",
                COALESCE(parent_id, channel_id::text) AS "parent_id!",
                thread_id,
                sender_id,
                triggered_by_user_id,
                content,
                created_at,
                updated_at,
                edited_at::timestamptz AS "edited_at?",
                deleted_at::timestamptz AS "deleted_at?"
            "#,
            message_id,
            parent.channel_uuid(),
            parent.db_type(),
            parent.entity_id,
            sender.as_ref(),
            content,
            thread_id,
        )
        .fetch_one(&self.pool)
        .await
        .context("unable to create thread message")?;
        Ok(row.into())
    }

    #[tracing::instrument(err, skip(self))]
    async fn resolve_message(
        &self,
        message_id: Uuid,
    ) -> Result<Option<ResolvedThreadMessage>, Self::Err> {
        let row = sqlx::query!(
            r#"
            SELECT
                m.id,
                COALESCE(m.parent_type, 'channel') AS "parent_type!",
                COALESCE(m.parent_id, m.channel_id::text) AS "parent_id!",
                COALESCE(m.thread_id, m.id) AS "thread_id!"
            FROM comms_messages m
            WHERE m.id = $1 AND m.deleted_at IS NULL
            "#,
            message_id,
        )
        .fetch_optional(&self.pool)
        .await
        .context("unable to resolve thread message")?;
        Ok(row.map(|r| ResolvedThreadMessage {
            message_id: r.id,
            parent_type: r.parent_type,
            parent_id: r.parent_id,
            thread_id: r.thread_id,
        }))
    }

    #[tracing::instrument(err, skip(self))]
    async fn get_top_level_threads(
        &self,
        parent: &ThreadParent,
        limit: i64,
        before: Option<DateTime<Utc>>,
    ) -> Result<Vec<TopLevelThreadRow>, Self::Err> {
        let rows = sqlx::query_as!(
            TopLevelRowDb,
            r#"
            SELECT
                m.id,
                COALESCE(m.parent_type, 'channel') AS "parent_type!",
                COALESCE(m.parent_id, m.channel_id::text) AS "parent_id!",
                m.thread_id,
                m.sender_id,
                m.triggered_by_user_id,
                m.content,
                m.created_at,
                m.updated_at,
                m.edited_at::timestamptz AS "edited_at?",
                m.deleted_at::timestamptz AS "deleted_at?",
                COALESCE(t.reply_count, 0) AS "reply_count!",
                t.latest_reply_at AS "latest_reply_at?",
                COALESCE(d.resolved, false) AS "resolved!",
                d.mark_id AS "mark_id?"
            FROM comms_messages m
            LEFT JOIN LATERAL (
                SELECT count(*) AS reply_count, max(r.created_at) AS latest_reply_at
                FROM comms_messages r
                WHERE r.thread_id = m.id AND r.deleted_at IS NULL
            ) t ON true
            LEFT JOIN comms_thread_details d ON d.root_message_id = m.id
            WHERE COALESCE(m.parent_type, 'channel') = $1
              AND COALESCE(m.parent_id, m.channel_id::text) = $2
              AND m.thread_id IS NULL
              AND m.deleted_at IS NULL
              AND ($3::timestamptz IS NULL OR m.created_at < $3)
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT $4
            "#,
            parent.db_type(),
            parent.entity_id,
            before,
            limit,
        )
        .fetch_all(&self.pool)
        .await
        .context("unable to fetch top-level threads")?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    #[tracing::instrument(err, skip(self))]
    async fn get_thread(
        &self,
        parent: &ThreadParent,
        root_message_id: Uuid,
    ) -> Result<Option<TopLevelThreadRow>, Self::Err> {
        let row = sqlx::query_as!(
            TopLevelRowDb,
            r#"
            SELECT
                m.id,
                COALESCE(m.parent_type, 'channel') AS "parent_type!",
                COALESCE(m.parent_id, m.channel_id::text) AS "parent_id!",
                m.thread_id,
                m.sender_id,
                m.triggered_by_user_id,
                m.content,
                m.created_at,
                m.updated_at,
                m.edited_at::timestamptz AS "edited_at?",
                m.deleted_at::timestamptz AS "deleted_at?",
                COALESCE(t.reply_count, 0) AS "reply_count!",
                t.latest_reply_at AS "latest_reply_at?",
                COALESCE(d.resolved, false) AS "resolved!",
                d.mark_id AS "mark_id?"
            FROM comms_messages m
            LEFT JOIN LATERAL (
                SELECT count(*) AS reply_count, max(r.created_at) AS latest_reply_at
                FROM comms_messages r
                WHERE r.thread_id = m.id AND r.deleted_at IS NULL
            ) t ON true
            LEFT JOIN comms_thread_details d ON d.root_message_id = m.id
            WHERE COALESCE(m.parent_type, 'channel') = $1
              AND COALESCE(m.parent_id, m.channel_id::text) = $2
              AND m.id = $3
              AND m.thread_id IS NULL
              AND m.deleted_at IS NULL
            "#,
            parent.db_type(),
            parent.entity_id,
            root_message_id,
        )
        .fetch_optional(&self.pool)
        .await
        .context("unable to fetch thread")?;
        Ok(row.map(Into::into))
    }

    #[tracing::instrument(err, skip(self))]
    async fn get_replies(&self, root_message_id: Uuid) -> Result<Vec<ThreadMessageRow>, Self::Err> {
        let rows = sqlx::query_as!(
            MessageRowDb,
            r#"
            SELECT
                m.id,
                COALESCE(m.parent_type, 'channel') AS "parent_type!",
                COALESCE(m.parent_id, m.channel_id::text) AS "parent_id!",
                m.thread_id,
                m.sender_id,
                m.triggered_by_user_id,
                m.content,
                m.created_at,
                m.updated_at,
                m.edited_at::timestamptz AS "edited_at?",
                m.deleted_at::timestamptz AS "deleted_at?"
            FROM comms_messages m
            WHERE m.thread_id = $1 AND m.deleted_at IS NULL
            ORDER BY m.created_at ASC, m.id ASC
            "#,
            root_message_id,
        )
        .fetch_all(&self.pool)
        .await
        .context("unable to fetch thread replies")?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    #[tracing::instrument(err, skip(self))]
    async fn get_reactions_batch(
        &self,
        message_ids: &[Uuid],
    ) -> Result<HashMap<Uuid, Vec<CountedReaction>>, Self::Err> {
        if message_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows = sqlx::query!(
            r#"
            SELECT
                message_id,
                emoji,
                array_agg(user_id ORDER BY created_at ASC) AS "users!: Vec<String>"
            FROM comms_reactions
            WHERE message_id = ANY($1)
            GROUP BY message_id, emoji
            ORDER BY message_id, min(created_at) ASC
            "#,
            message_ids,
        )
        .fetch_all(&self.pool)
        .await
        .context("unable to fetch reactions")?;

        let mut out: HashMap<Uuid, Vec<CountedReaction>> = HashMap::new();
        for row in rows {
            out.entry(row.message_id)
                .or_default()
                .push(CountedReaction {
                    emoji: row.emoji,
                    users: row.users,
                });
        }
        Ok(out)
    }

    #[tracing::instrument(err, skip(self))]
    async fn get_attachments_batch(
        &self,
        message_ids: &[Uuid],
    ) -> Result<HashMap<Uuid, Vec<ThreadAttachment>>, Self::Err> {
        if message_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows = sqlx::query!(
            r#"
            SELECT id, message_id, entity_type, entity_id, width, height, created_at
            FROM comms_attachments
            WHERE message_id = ANY($1)
            ORDER BY created_at ASC
            "#,
            message_ids,
        )
        .fetch_all(&self.pool)
        .await
        .context("unable to fetch attachments")?;

        let mut out: HashMap<Uuid, Vec<ThreadAttachment>> = HashMap::new();
        for row in rows {
            out.entry(row.message_id)
                .or_default()
                .push(ThreadAttachment {
                    id: row.id,
                    entity_type: row.entity_type,
                    entity_id: row.entity_id,
                    width: row.width,
                    height: row.height,
                    created_at: row.created_at,
                });
        }
        Ok(out)
    }

    #[tracing::instrument(err, skip(self))]
    async fn upsert_thread_details(
        &self,
        root_message_id: Uuid,
        mark_id: Option<String>,
    ) -> Result<(), Self::Err> {
        sqlx::query!(
            r#"
            INSERT INTO comms_thread_details (root_message_id, mark_id)
            VALUES ($1, $2)
            ON CONFLICT (root_message_id) DO UPDATE
            SET mark_id = COALESCE(comms_thread_details.mark_id, EXCLUDED.mark_id),
                updated_at = now()
            "#,
            root_message_id,
            mark_id,
        )
        .execute(&self.pool)
        .await
        .context("unable to upsert thread details")?;
        Ok(())
    }

    #[tracing::instrument(err, skip(self))]
    async fn set_thread_resolved(
        &self,
        root_message_id: Uuid,
        resolved: bool,
    ) -> Result<(), Self::Err> {
        sqlx::query!(
            r#"
            INSERT INTO comms_thread_details (root_message_id, resolved)
            VALUES ($1, $2)
            ON CONFLICT (root_message_id) DO UPDATE
            SET resolved = EXCLUDED.resolved,
                updated_at = now()
            "#,
            root_message_id,
            resolved,
        )
        .execute(&self.pool)
        .await
        .context("unable to set thread resolved")?;
        Ok(())
    }

    #[tracing::instrument(err, skip(self))]
    async fn set_reaction(
        &self,
        message_id: Uuid,
        user_id: &str,
        emoji: &str,
        active: bool,
    ) -> Result<Vec<CountedReaction>, Self::Err> {
        if active {
            sqlx::query!(
                r#"
                INSERT INTO comms_reactions (message_id, emoji, user_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (message_id, emoji, user_id) DO NOTHING
                "#,
                message_id,
                emoji,
                user_id,
            )
            .execute(&self.pool)
            .await
            .context("unable to add reaction")?;
        } else {
            sqlx::query!(
                r#"
                DELETE FROM comms_reactions
                WHERE message_id = $1 AND emoji = $2 AND user_id = $3
                "#,
                message_id,
                emoji,
                user_id,
            )
            .execute(&self.pool)
            .await
            .context("unable to remove reaction")?;
        }

        let reactions = self.get_reactions_batch(&[message_id]).await?;
        Ok(reactions.into_values().next().unwrap_or_default())
    }

    #[tracing::instrument(err, skip(self))]
    async fn create_entity_mentions(
        &self,
        message_id: Uuid,
        mentions: &[ThreadMention],
    ) -> Result<(), Self::Err> {
        if mentions.is_empty() {
            return Ok(());
        }
        let entity_types: Vec<String> = mentions.iter().map(|m| m.entity_type.clone()).collect();
        let entity_ids: Vec<String> = mentions.iter().map(|m| m.entity_id.clone()).collect();
        sqlx::query!(
            r#"
            INSERT INTO comms_entity_mentions (id, source_entity_type, source_entity_id, entity_type, entity_id, user_id)
            SELECT gen_random_uuid(), 'message', $1::text, t.entity_type, t.entity_id, NULL
            FROM UNNEST($2::text[], $3::text[]) AS t(entity_type, entity_id)
            WHERE NOT EXISTS (
                SELECT 1 FROM comms_entity_mentions em
                WHERE em.source_entity_type = 'message'
                  AND em.source_entity_id = $1::text
                  AND em.entity_type = t.entity_type
                  AND em.entity_id = t.entity_id
            )
            "#,
            message_id.to_string(),
            &entity_types as &[String],
            &entity_ids as &[String],
        )
        .execute(&self.pool)
        .await
        .context("unable to create thread message mentions")?;
        Ok(())
    }

    #[tracing::instrument(err, skip(self))]
    async fn get_legacy_thread(
        &self,
        legacy_source: &str,
        legacy_thread_id: &str,
    ) -> Result<Option<LegacyThreadRef>, Self::Err> {
        let row = sqlx::query!(
            r#"
            SELECT
                d.root_message_id,
                COALESCE(m.parent_type, 'channel') AS "parent_type!",
                COALESCE(m.parent_id, m.channel_id::text) AS "parent_id!"
            FROM comms_thread_details d
            JOIN comms_messages m ON m.id = d.root_message_id
            WHERE d.legacy_source = $1 AND d.legacy_thread_id = $2
            "#,
            legacy_source,
            legacy_thread_id,
        )
        .fetch_optional(&self.pool)
        .await
        .context("unable to resolve legacy thread")?;
        Ok(row.map(|r| LegacyThreadRef {
            root_message_id: r.root_message_id,
            parent_type: r.parent_type,
            parent_id: r.parent_id,
        }))
    }
}
