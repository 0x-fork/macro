use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::models::{ThreadDeltaDigest, ThreadDeltaQuery};

/// Highest possible uuid, used as the descending keyset's id sentinel on the
/// first page (pairs with `timestamptz 'infinity'`).
const UUID_MAX: Uuid = Uuid::from_u128(u128::MAX);

/// One page of the thread delta feed.
///
/// `email_threads.updated_at` is the authoritative content watermark (see
/// [`ThreadDeltaDigest`]), so a page is a bounded keyset scan per link over
/// `idx_email_threads_link_id_updated_at (link_id, updated_at, id)`. The
/// `LATERAL` over the caller's links keeps each branch an index-only scan
/// with its own `LIMIT`, so a page costs O(links × limit) regardless of
/// mailbox size; the outer sort trims the union back down to one page.
///
/// Keyset semantics (ascending): `(updated_at, id) > (after_ts, after_id)`,
/// where the first page passes `(since, nil-uuid)` — this intentionally
/// *includes* rows with `updated_at == since`. The client treats digest
/// processing as idempotent and re-syncs with a small overlap window, so
/// boundary duplicates are preferred over boundary gaps.
#[tracing::instrument(err, skip(pool, query))]
pub(super) async fn thread_delta(
    pool: &PgPool,
    query: &ThreadDeltaQuery,
) -> Result<Vec<ThreadDeltaDigest>, sqlx::Error> {
    let (cursor_id, cursor_ts) = query.query.vals();
    let cursor_ts: Option<DateTime<Utc>> = cursor_ts.copied();
    let cursor_id: Option<Uuid> = cursor_id.copied();
    let limit = query.limit as i64;

    let rows = if query.descending {
        sqlx::query_as!(
            DeltaRow,
            r#"
            SELECT
                d.thread_id AS "thread_id!",
                d.link_id AS "link_id!",
                d.watermark AS "watermark!"
            FROM unnest($1::uuid[]) AS l(link_id)
            CROSS JOIN LATERAL (
                SELECT t.id AS thread_id, t.link_id, t.updated_at AS watermark
                FROM email_threads t
                WHERE t.link_id = l.link_id
                  AND t.updated_at >= $2
                  AND (t.updated_at, t.id)
                      < (COALESCE($3::timestamptz, 'infinity'::timestamptz), $4::uuid)
                ORDER BY t.updated_at DESC, t.id DESC
                LIMIT $5
            ) d
            ORDER BY d.watermark DESC, d.thread_id DESC
            LIMIT $5
            "#,
            &query.link_ids,
            query.since,
            cursor_ts,
            cursor_id.unwrap_or(UUID_MAX),
            limit,
        )
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as!(
            DeltaRow,
            r#"
            SELECT
                d.thread_id AS "thread_id!",
                d.link_id AS "link_id!",
                d.watermark AS "watermark!"
            FROM unnest($1::uuid[]) AS l(link_id)
            CROSS JOIN LATERAL (
                SELECT t.id AS thread_id, t.link_id, t.updated_at AS watermark
                FROM email_threads t
                WHERE t.link_id = l.link_id
                  AND (t.updated_at, t.id) > (COALESCE($2::timestamptz, $3), $4::uuid)
                ORDER BY t.updated_at ASC, t.id ASC
                LIMIT $5
            ) d
            ORDER BY d.watermark ASC, d.thread_id ASC
            LIMIT $5
            "#,
            &query.link_ids,
            cursor_ts,
            query.since,
            cursor_id.unwrap_or(Uuid::nil()),
            limit,
        )
        .fetch_all(pool)
        .await?
    };

    Ok(rows
        .into_iter()
        .map(|r| ThreadDeltaDigest {
            thread_id: r.thread_id,
            link_id: r.link_id,
            watermark: r.watermark,
        })
        .collect())
}

struct DeltaRow {
    thread_id: Uuid,
    link_id: Uuid,
    watermark: DateTime<Utc>,
}
