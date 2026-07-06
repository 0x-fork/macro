//! Backfill document annotation comments and CRM comments into the unified
//! thread shape (`comms_messages` + `comms_thread_details`).
//!
//! Unified thread architecture, phase 2 (see
//! `docs/unified-thread-architecture.md` §4). Mapping:
//!
//! - a legacy thread's first live comment (by `"order"` then `createdAt`)
//!   becomes a **top-level** `comms_messages` row parented to the document /
//!   CRM entity;
//! - every other live comment becomes a **reply** (`thread_id` = the root's
//!   new uuid);
//! - thread-level state (resolved, lexical `markId`) lands in
//!   `comms_thread_details`, with the `DISCUSSION:` markId sentinel
//!   normalized to `mark_id = NULL` (unanchored thread);
//! - `legacy_comment_message_map` records every old→new id pair so deep
//!   links and old notification metadata stay resolvable;
//! - PDF/DOCX `"ThreadAnchor"` rows are re-keyed with the new root message id
//!   (`"threadMessageId"`);
//! - user/document mentions embedded in comment markdown are re-parsed into
//!   `comms_entity_mentions`.
//!
//! Every phase is idempotent and keyset-batched: re-running skips anything
//! already mapped. The legacy tables are never written — they stay
//! authoritative until the annotations read path is retired.
//!
//! Usage: `backfill_comment_threads <backfill|verify>`

mod config;
#[cfg(test)]
mod test;

use anyhow::Context;
use config::EnvVars;
use macro_entrypoint::MacroEntrypoint;
use sqlx::postgres::PgPoolOptions;
use sqlx::{Pool, Postgres, Row};
use uuid::Uuid;

/// Legacy rows consumed per SQL statement. Each batch is a single
/// `INSERT ... SELECT` in its own autocommit transaction, keeping lock windows
/// and WAL size bounded.
const BATCH_SIZE: i64 = 2_000;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    MacroEntrypoint::default().init();

    let command = std::env::args()
        .nth(1)
        .context("usage: backfill_comment_threads <backfill|verify>")?;

    let env_vars = EnvVars::new()?;

    let db = PgPoolOptions::new()
        .min_connections(1)
        .max_connections(4)
        .connect(&env_vars.database_url)
        .await
        .context("could not connect to db")?;

    match command.as_str() {
        "backfill" => {
            println!("Starting comment-thread backfill...");
            backfill_annotation_roots(&db).await?;
            backfill_annotation_replies(&db).await?;
            backfill_crm_roots(&db).await?;
            backfill_crm_replies(&db).await?;
            rekey_thread_anchors(&db).await?;
            backfill_mentions(&db).await?;
            println!("All backfill phases COMPLETED");
        }
        "verify" => verify(&db).await?,
        other => anyhow::bail!(
            "unknown command: {other}. usage: backfill_comment_threads <backfill|verify>"
        ),
    }

    Ok(())
}

/// Drives a keyset-paginated loop over a bigint cursor. `sql` must bind
/// `$1 = cursor bigint` and `$2 = batch size bigint` and return one row
/// `(Option<i64>, i64)`: the max source id consumed (NULL = done) and the
/// number of source rows considered.
#[allow(clippy::disallowed_methods, reason = "one-shot migration tool")]
async fn run_keyset_i64(db: &Pool<Postgres>, label: &str, sql: &str) -> anyhow::Result<()> {
    let start = std::time::Instant::now();
    let mut cursor: i64 = 0;
    let mut batches: u64 = 0;
    let mut total_rows: i64 = 0;
    loop {
        let (next_cursor, batch_rows): (Option<i64>, i64) = sqlx::query_as(sql)
            .bind(cursor)
            .bind(BATCH_SIZE)
            .fetch_one(db)
            .await
            .with_context(|| format!("[{label}] batch {batches} failed at cursor={cursor}"))?;

        match next_cursor {
            Some(max_id) => {
                batches += 1;
                total_rows += batch_rows;
                cursor = max_id;
            }
            None => {
                println!(
                    "[{label}] DONE: {batches} batches, {total_rows} source rows in {:?}",
                    start.elapsed()
                );
                return Ok(());
            }
        }
    }
}

/// Same driver over a uuid cursor (CRM tables use uuid PKs).
#[allow(clippy::disallowed_methods, reason = "one-shot migration tool")]
async fn run_keyset_uuid(db: &Pool<Postgres>, label: &str, sql: &str) -> anyhow::Result<()> {
    let start = std::time::Instant::now();
    let mut cursor: Uuid = Uuid::nil();
    let mut batches: u64 = 0;
    let mut total_rows: i64 = 0;
    loop {
        let (next_cursor, batch_rows): (Option<Uuid>, i64) = sqlx::query_as(sql)
            .bind(cursor)
            .bind(BATCH_SIZE)
            .fetch_one(db)
            .await
            .with_context(|| format!("[{label}] batch {batches} failed at cursor={cursor}"))?;

        match next_cursor {
            Some(max_id) => {
                batches += 1;
                total_rows += batch_rows;
                cursor = max_id;
            }
            None => {
                println!(
                    "[{label}] DONE: {batches} batches, {total_rows} source rows in {:?}",
                    start.elapsed()
                );
                return Ok(());
            }
        }
    }
}

/// Phase 1: annotation thread roots. The first live comment of each live
/// thread becomes a top-level document-parented message; thread details and
/// the id map are written in the same statement.
///
/// `roots` MUST be MATERIALIZED: it calls gen_random_uuid() and feeds three
/// separate inserts — an inlined (re-evaluated) CTE would mint different
/// uuids per consumer.
async fn backfill_annotation_roots(db: &Pool<Postgres>) -> anyhow::Result<()> {
    println!("[annotation_roots] STARTING");
    run_keyset_i64(
        db,
        "annotation_roots",
        r#"
        WITH batch AS (
            SELECT t.id AS legacy_thread_id,
                   t."documentId" AS document_id,
                   COALESCE(t.resolved, false) AS resolved,
                   t.metadata->>'markId' AS mark_id
            FROM "Thread" t
            WHERE t.id > $1
              AND t."deletedAt" IS NULL
              AND t."documentId" IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM "Comment" c
                  WHERE c."threadId" = t.id AND c."deletedAt" IS NULL
              )
            ORDER BY t.id
            LIMIT $2
        ),
        roots AS MATERIALIZED (
            SELECT gen_random_uuid() AS message_id,
                   b.legacy_thread_id,
                   b.document_id,
                   b.resolved,
                   b.mark_id,
                   c.id AS legacy_comment_id,
                   COALESCE(c.sender, c.owner, '') AS sender_id,
                   COALESCE(c.text, '') AS content,
                   c."createdAt" AS created_at,
                   c."updatedAt" AS updated_at
            FROM batch b
            JOIN LATERAL (
                SELECT c.*
                FROM "Comment" c
                WHERE c."threadId" = b.legacy_thread_id AND c."deletedAt" IS NULL
                ORDER BY c."order" ASC NULLS LAST, c."createdAt" ASC, c.id ASC
                LIMIT 1
            ) c ON true
            WHERE NOT EXISTS (
                SELECT 1 FROM comms_thread_details d
                WHERE d.legacy_source = 'annotation'
                  AND d.legacy_thread_id = b.legacy_thread_id::text
            )
        ),
        ins_msg AS (
            INSERT INTO comms_messages
                (id, channel_id, parent_type, parent_id, thread_id, sender_id, content, created_at, updated_at, edited_at)
            SELECT r.message_id, NULL, 'document', r.document_id, NULL, r.sender_id, r.content,
                   r.created_at AT TIME ZONE 'UTC',
                   r.updated_at AT TIME ZONE 'UTC',
                   CASE WHEN r.updated_at > r.created_at THEN r.updated_at END
            FROM roots r
        ),
        ins_details AS (
            INSERT INTO comms_thread_details (root_message_id, resolved, mark_id, legacy_source, legacy_thread_id)
            SELECT r.message_id, r.resolved,
                   CASE WHEN r.mark_id LIKE 'DISCUSSION:%' THEN NULL ELSE r.mark_id END,
                   'annotation', r.legacy_thread_id::text
            FROM roots r
        ),
        ins_map AS (
            INSERT INTO legacy_comment_message_map (legacy_source, legacy_comment_id, legacy_thread_id, message_id, root_message_id)
            SELECT 'annotation', r.legacy_comment_id::text, r.legacy_thread_id::text, r.message_id, r.message_id
            FROM roots r
        )
        SELECT max(b.legacy_thread_id), count(*) FROM batch b
        "#,
    )
    .await
}

/// Phase 2: annotation replies — every remaining live comment of a mapped
/// thread becomes a reply under the new root.
async fn backfill_annotation_replies(db: &Pool<Postgres>) -> anyhow::Result<()> {
    println!("[annotation_replies] STARTING");
    run_keyset_i64(
        db,
        "annotation_replies",
        r#"
        WITH batch AS (
            SELECT c.id AS legacy_comment_id,
                   c."threadId" AS legacy_thread_id,
                   COALESCE(c.sender, c.owner, '') AS sender_id,
                   COALESCE(c.text, '') AS content,
                   c."createdAt" AS created_at,
                   c."updatedAt" AS updated_at,
                   d.root_message_id,
                   m.parent_id AS document_id
            FROM "Comment" c
            JOIN comms_thread_details d
              ON d.legacy_source = 'annotation'
             AND d.legacy_thread_id = c."threadId"::text
            JOIN comms_messages m ON m.id = d.root_message_id
            WHERE c.id > $1
              AND c."deletedAt" IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM legacy_comment_message_map mm
                  WHERE mm.legacy_source = 'annotation'
                    AND mm.legacy_comment_id = c.id::text
              )
            ORDER BY c.id
            LIMIT $2
        ),
        replies AS MATERIALIZED (
            SELECT gen_random_uuid() AS message_id, b.* FROM batch b
        ),
        ins_msg AS (
            INSERT INTO comms_messages
                (id, channel_id, parent_type, parent_id, thread_id, sender_id, content, created_at, updated_at, edited_at)
            SELECT r.message_id, NULL, 'document', r.document_id, r.root_message_id, r.sender_id, r.content,
                   r.created_at AT TIME ZONE 'UTC',
                   r.updated_at AT TIME ZONE 'UTC',
                   CASE WHEN r.updated_at > r.created_at THEN r.updated_at END
            FROM replies r
        ),
        ins_map AS (
            INSERT INTO legacy_comment_message_map (legacy_source, legacy_comment_id, legacy_thread_id, message_id, root_message_id)
            SELECT 'annotation', r.legacy_comment_id::text, r.legacy_thread_id::text, r.message_id, r.root_message_id
            FROM replies r
        )
        SELECT max(b.legacy_comment_id), count(*) FROM batch b
        "#,
    )
    .await
}

/// Phase 3: CRM thread roots (crm_thread/crm_comment → parent crm_company or
/// crm_contact). Same shape as the annotation phases, uuid ids and
/// timestamptz columns.
async fn backfill_crm_roots(db: &Pool<Postgres>) -> anyhow::Result<()> {
    println!("[crm_roots] STARTING");
    run_keyset_uuid(
        db,
        "crm_roots",
        r#"
        WITH batch AS (
            SELECT t.id AS legacy_thread_id,
                   CASE WHEN t.company_id IS NOT NULL THEN 'crm_company' ELSE 'crm_contact' END AS parent_type,
                   COALESCE(t.company_id, t.contact_id)::text AS parent_id,
                   t.resolved
            FROM crm_thread t
            WHERE t.id > $1
              AND t.deleted_at IS NULL
              AND EXISTS (
                  SELECT 1 FROM crm_comment c
                  WHERE c.thread_id = t.id AND c.deleted_at IS NULL
              )
            ORDER BY t.id
            LIMIT $2
        ),
        roots AS MATERIALIZED (
            SELECT gen_random_uuid() AS message_id,
                   b.legacy_thread_id,
                   b.parent_type,
                   b.parent_id,
                   b.resolved,
                   c.id AS legacy_comment_id,
                   COALESCE(c.sender, c.owner) AS sender_id,
                   c.text AS content,
                   c.created_at,
                   c.updated_at
            FROM batch b
            JOIN LATERAL (
                SELECT c.*
                FROM crm_comment c
                WHERE c.thread_id = b.legacy_thread_id AND c.deleted_at IS NULL
                ORDER BY c."order" ASC NULLS LAST, c.created_at ASC, c.id ASC
                LIMIT 1
            ) c ON true
            WHERE NOT EXISTS (
                SELECT 1 FROM comms_thread_details d
                WHERE d.legacy_source = 'crm'
                  AND d.legacy_thread_id = b.legacy_thread_id::text
            )
        ),
        ins_msg AS (
            INSERT INTO comms_messages
                (id, channel_id, parent_type, parent_id, thread_id, sender_id, content, created_at, updated_at, edited_at)
            SELECT r.message_id, NULL, r.parent_type, r.parent_id, NULL, r.sender_id, r.content,
                   r.created_at, r.updated_at,
                   CASE WHEN r.updated_at > r.created_at THEN (r.updated_at AT TIME ZONE 'UTC') END
            FROM roots r
        ),
        ins_details AS (
            INSERT INTO comms_thread_details (root_message_id, resolved, mark_id, legacy_source, legacy_thread_id)
            SELECT r.message_id, r.resolved, NULL, 'crm', r.legacy_thread_id::text
            FROM roots r
        ),
        ins_map AS (
            INSERT INTO legacy_comment_message_map (legacy_source, legacy_comment_id, legacy_thread_id, message_id, root_message_id)
            SELECT 'crm', r.legacy_comment_id::text, r.legacy_thread_id::text, r.message_id, r.message_id
            FROM roots r
        )
        -- no max(uuid) in Postgres; take the last id of the ordered batch
        SELECT (SELECT b2.legacy_thread_id FROM batch b2 ORDER BY b2.legacy_thread_id DESC LIMIT 1),
               count(*)
        FROM batch b
        "#,
    )
    .await
}

/// Phase 4: CRM replies.
async fn backfill_crm_replies(db: &Pool<Postgres>) -> anyhow::Result<()> {
    println!("[crm_replies] STARTING");
    run_keyset_uuid(
        db,
        "crm_replies",
        r#"
        WITH batch AS (
            SELECT c.id AS legacy_comment_id,
                   c.thread_id AS legacy_thread_id,
                   COALESCE(c.sender, c.owner) AS sender_id,
                   c.text AS content,
                   c.created_at,
                   c.updated_at,
                   d.root_message_id,
                   m.parent_type,
                   m.parent_id
            FROM crm_comment c
            JOIN comms_thread_details d
              ON d.legacy_source = 'crm'
             AND d.legacy_thread_id = c.thread_id::text
            JOIN comms_messages m ON m.id = d.root_message_id
            WHERE c.id > $1
              AND c.deleted_at IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM legacy_comment_message_map mm
                  WHERE mm.legacy_source = 'crm'
                    AND mm.legacy_comment_id = c.id::text
              )
            ORDER BY c.id
            LIMIT $2
        ),
        replies AS MATERIALIZED (
            SELECT gen_random_uuid() AS message_id, b.* FROM batch b
        ),
        ins_msg AS (
            INSERT INTO comms_messages
                (id, channel_id, parent_type, parent_id, thread_id, sender_id, content, created_at, updated_at, edited_at)
            SELECT r.message_id, NULL, r.parent_type, r.parent_id, r.root_message_id, r.sender_id, r.content,
                   r.created_at, r.updated_at,
                   CASE WHEN r.updated_at > r.created_at THEN (r.updated_at AT TIME ZONE 'UTC') END
            FROM replies r
        ),
        ins_map AS (
            INSERT INTO legacy_comment_message_map (legacy_source, legacy_comment_id, legacy_thread_id, message_id, root_message_id)
            SELECT 'crm', r.legacy_comment_id::text, r.legacy_thread_id::text, r.message_id, r.root_message_id
            FROM replies r
        )
        -- no max(uuid) in Postgres; take the last id of the ordered batch
        SELECT (SELECT b2.legacy_comment_id FROM batch b2 ORDER BY b2.legacy_comment_id DESC LIMIT 1),
               count(*)
        FROM batch b
        "#,
    )
    .await
}

/// Phase 5: point PDF/DOCX anchors at their unified thread. The legacy bigint
/// "threadId" stays authoritative until the annotations read path is retired.
#[allow(clippy::disallowed_methods, reason = "one-shot migration tool")]
async fn rekey_thread_anchors(db: &Pool<Postgres>) -> anyhow::Result<()> {
    println!("[thread_anchors] STARTING");
    let result = sqlx::query(
        r#"
        UPDATE "ThreadAnchor" a
        SET "threadMessageId" = d.root_message_id
        FROM comms_thread_details d
        WHERE d.legacy_source = 'annotation'
          AND d.legacy_thread_id = a."threadId"::text
          AND a."threadMessageId" IS NULL
        "#,
    )
    .execute(db)
    .await
    .context("[thread_anchors] update failed")?;
    println!(
        "[thread_anchors] DONE: {} anchors re-keyed",
        result.rows_affected()
    );
    Ok(())
}

/// Phase 6: re-parse mention markup out of migrated comment bodies into
/// `comms_entity_mentions` (source = the new message), so historical comments
/// participate in the "threads mentioning entity X" half of the discussion
/// union.
///
/// User mentions come from `mention_utils` (the canonical parser). Document
/// mentions carry their id only in the tag's JSON payload (the Rust parser
/// only surfaces `documentName`), so they are extracted with a local payload
/// parse of the same tag.
#[allow(clippy::disallowed_methods, reason = "one-shot migration tool")]
async fn backfill_mentions(db: &Pool<Postgres>) -> anyhow::Result<()> {
    println!("[mentions] STARTING");
    let start = std::time::Instant::now();
    let mut cursor: Uuid = Uuid::nil();
    let mut total_mentions: u64 = 0;
    loop {
        let rows = sqlx::query(
            r#"
            SELECT m.id, m.content
            FROM legacy_comment_message_map map
            JOIN comms_messages m ON m.id = map.message_id
            WHERE map.message_id > $1
              AND m.content LIKE '%<m-%'
            ORDER BY map.message_id
            LIMIT $2
            "#,
        )
        .bind(cursor)
        .bind(BATCH_SIZE)
        .fetch_all(db)
        .await
        .context("[mentions] batch fetch failed")?;

        let Some(last) = rows.last() else {
            println!(
                "[mentions] DONE: {total_mentions} mentions in {:?}",
                start.elapsed()
            );
            return Ok(());
        };
        cursor = last.get::<Uuid, _>("id");

        for row in &rows {
            let message_id: Uuid = row.get("id");
            let content: String = row.get("content");
            let mentions = extract_mentions(&content);
            if mentions.is_empty() {
                continue;
            }
            let (types, ids): (Vec<String>, Vec<String>) = mentions.into_iter().unzip();
            total_mentions += types.len() as u64;
            sqlx::query(
                r#"
                INSERT INTO comms_entity_mentions (id, source_entity_type, source_entity_id, entity_type, entity_id, user_id)
                SELECT gen_random_uuid(), 'message', $1, t.entity_type, t.entity_id, NULL
                FROM UNNEST($2::text[], $3::text[]) AS t(entity_type, entity_id)
                WHERE NOT EXISTS (
                    SELECT 1 FROM comms_entity_mentions em
                    WHERE em.source_entity_type = 'message'
                      AND em.source_entity_id = $1
                      AND em.entity_type = t.entity_type
                      AND em.entity_id = t.entity_id
                )
                "#,
            )
            .bind(message_id.to_string())
            .bind(&types)
            .bind(&ids)
            .execute(db)
            .await
            .context("[mentions] insert failed")?;
        }
    }
}

/// Extract `(entity_type, entity_id)` mention pairs from comment markdown.
///
/// Deliberately NOT built on `mention_utils::parse::ParsedXmlText`: that
/// parser fails the *entire* text when any single tag payload is malformed
/// (e.g. a legacy userId that predates the strict `provider|email` MacroUserId
/// format — cf. the `normalize_macro_bot_mention_ids` migration), which would
/// silently drop every mention in that comment. A per-tag scan degrades
/// per-mention instead. Ids are carried verbatim, matching what
/// `create_message_mentions` stores for live messages.
fn extract_mentions(content: &str) -> Vec<(String, String)> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct UserMentionPayload {
        user_id: String,
    }
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct DocumentMentionPayload {
        document_id: String,
    }

    fn scan_tag<'a, P: serde::Deserialize<'a>>(
        content: &'a str,
        tag_name: &str,
        out: &mut Vec<(String, String)>,
        entity_type: &str,
        entity_id: impl Fn(P) -> String,
    ) {
        let open = format!("<{tag_name}>");
        let close = format!("</{tag_name}>");
        let mut rest = content;
        while let Some(start) = rest.find(&open) {
            rest = &rest[start + open.len()..];
            let Some(end) = rest.find(&close) else { break };
            if let Ok(payload) = serde_json::from_str::<P>(&rest[..end]) {
                out.push((entity_type.to_string(), entity_id(payload)));
            }
            rest = &rest[end + close.len()..];
        }
    }

    let mut out = Vec::new();
    scan_tag::<UserMentionPayload>(content, "m-user-mention", &mut out, "user", |p| p.user_id);
    scan_tag::<DocumentMentionPayload>(content, "m-document-mention", &mut out, "document", |p| {
        p.document_id
    });

    out.sort();
    out.dedup();
    out
}

/// Print source vs. migrated counts for a quick consistency check.
#[allow(clippy::disallowed_methods, reason = "one-shot migration tool")]
async fn verify(db: &Pool<Postgres>) -> anyhow::Result<()> {
    let report = sqlx::query(
        r#"
        SELECT
            (SELECT count(*) FROM "Thread" t
             WHERE t."deletedAt" IS NULL AND t."documentId" IS NOT NULL
               AND EXISTS (SELECT 1 FROM "Comment" c WHERE c."threadId" = t.id AND c."deletedAt" IS NULL)
            ) AS live_annotation_threads,
            (SELECT count(*) FROM comms_thread_details WHERE legacy_source = 'annotation') AS migrated_annotation_threads,
            (SELECT count(*) FROM "Comment" c
             JOIN "Thread" t ON t.id = c."threadId"
             WHERE c."deletedAt" IS NULL AND t."deletedAt" IS NULL AND t."documentId" IS NOT NULL
            ) AS live_annotation_comments,
            (SELECT count(*) FROM legacy_comment_message_map WHERE legacy_source = 'annotation') AS migrated_annotation_comments,
            (SELECT count(*) FROM crm_thread t
             WHERE t.deleted_at IS NULL
               AND EXISTS (SELECT 1 FROM crm_comment c WHERE c.thread_id = t.id AND c.deleted_at IS NULL)
            ) AS live_crm_threads,
            (SELECT count(*) FROM comms_thread_details WHERE legacy_source = 'crm') AS migrated_crm_threads,
            (SELECT count(*) FROM crm_comment c
             JOIN crm_thread t ON t.id = c.thread_id
             WHERE c.deleted_at IS NULL AND t.deleted_at IS NULL
            ) AS live_crm_comments,
            (SELECT count(*) FROM legacy_comment_message_map WHERE legacy_source = 'crm') AS migrated_crm_comments,
            (SELECT count(*) FROM "ThreadAnchor" WHERE "threadMessageId" IS NOT NULL) AS rekeyed_anchors
        "#,
    )
    .fetch_one(db)
    .await?;

    for column in [
        "live_annotation_threads",
        "migrated_annotation_threads",
        "live_annotation_comments",
        "migrated_annotation_comments",
        "live_crm_threads",
        "migrated_crm_threads",
        "live_crm_comments",
        "migrated_crm_comments",
        "rekeyed_anchors",
    ] {
        let value: i64 = report.get(column);
        println!("{column}: {value}");
    }
    Ok(())
}
