use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct CallRecordSearchBackfill {
    pub call_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct CallRecordMetadataRow {
    pub call_id: Uuid,
    pub created_by: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: DateTime<Utc>,
    pub duration_ms: i64,
    pub channel_name: Option<String>,
    /// Whether the requesting user was a participant on the call.
    pub attended: bool,
}

#[derive(Debug, Clone)]
pub struct CallRecordTranscriptSegment {
    pub transcript_id: Uuid,
    pub speaker_id: String,
    pub sequence_num: i32,
    pub content: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct CallRecordSearchPayload {
    pub call_id: Uuid,
    pub channel_id: Uuid,
    pub created_by: String,
    pub channel_name: Option<String>,
    pub participant_ids: Vec<String>,
    pub segments: Vec<CallRecordTranscriptSegment>,
}

/// Arguments for [`get_accessible_call_ids`].
#[derive(Debug, Clone, Copy)]
pub struct AccessibleCallIdsArgs<'a> {
    /// User whose access we are evaluating.
    pub user_id: &'a str,
    /// `Some(true)` keeps only calls the user joined; `Some(false)` keeps only
    /// calls they did not join; `None` skips the filter.
    pub attended: Option<bool>,
    /// Optional channel filter — empty means no filter.
    pub channel_ids: &'a [Uuid],
    /// When `true`, also returns active (un-archived) call ids from the
    /// `calls` table. When `false`, only `call_records` rows are considered
    /// (which is what search needs because OpenSearch only indexes archived
    /// calls).
    pub include_active: bool,
    /// When `true`, calls with a public share permission are returned even if
    /// the user has no `entity_access` grant. Search wants this so query
    /// results surface publicly-shared calls; the soup feed leaves it `false`
    /// to stay consistent with how documents/chats/projects appear in soup
    /// (entity_access only).
    pub include_public_share: bool,
}

/// Returns the call ids a user can access via `entity_access` grants
/// (channel/team/user) or, if `include_public_share` is set, a public
/// share permission.
///
/// The access CTE in this query is asserted (in tests) to match the
/// canonical [`models_call::sql::ACCESSIBLE_CALL_IDS_CTE`], which is
/// the same fragment the soup feed pastes into
/// `call::outbound::pg_call_repo::get_call_records_by_user`. sqlx's
/// `query!` proc macro requires its SQL to be a single string literal at
/// the call site (no `concat!`/`include_str!`/macro_rules! indirection),
/// so the SQL is duplicated by necessity — the test guards against drift.
#[tracing::instrument(skip(db))]
pub async fn get_accessible_call_ids(
    db: &sqlx::Pool<sqlx::Postgres>,
    args: AccessibleCallIdsArgs<'_>,
) -> anyhow::Result<Vec<Uuid>> {
    let AccessibleCallIdsArgs {
        user_id,
        attended,
        channel_ids,
        include_active,
        include_public_share,
    } = args;
    let has_channel_filter = !channel_ids.is_empty();
    sqlx::query_scalar!(
        r#"
        WITH user_source_ids AS (
            SELECT cp.channel_id::text AS source_id
            FROM comms_channel_participants cp
            WHERE cp.user_id = $1 AND cp.left_at IS NULL
            UNION ALL
            SELECT t.team_id::text
            FROM team_user t
            WHERE t.user_id = $1
            UNION ALL
            SELECT $1
        ),
        all_calls AS (
            SELECT id, channel_id, share_permission_id
            FROM call_records
            UNION ALL
            SELECT id, channel_id, share_permission_id
            FROM calls
            WHERE $5::bool = true
        ),
        accessible_call_ids AS (
            SELECT DISTINCT ac.id AS call_id
            FROM all_calls ac
            WHERE (
                EXISTS (
                    SELECT 1 FROM entity_access ea
                    WHERE ea.entity_id = ac.id
                      AND ea.entity_type = 'call'
                      AND ea.source_id IN (SELECT source_id FROM user_source_ids)
                ) OR ($6::bool = true AND EXISTS (
                    SELECT 1 FROM "SharePermission" sp
                    WHERE sp.id = ac.share_permission_id
                      AND sp."isPublic" = true
                      AND sp."publicAccessLevel" IS NOT NULL
                ))
            )
            AND ($3::bool IS FALSE OR ac.channel_id = ANY($4))
            AND ($2::bool IS NULL OR (
                EXISTS (
                    SELECT 1 FROM call_record_participants crp
                    WHERE crp.call_record_id = ac.id AND crp.user_id = $1
                ) OR EXISTS (
                    SELECT 1 FROM call_participants cp
                    WHERE cp.call_id = ac.id AND cp.user_id = $1
                )
            ) = $2)
        )
        SELECT call_id AS "id!" FROM accessible_call_ids
        "#,
        user_id,
        attended,
        has_channel_filter,
        channel_ids,
        include_active,
        include_public_share,
    )
    .fetch_all(db)
    .await
    .map_err(Into::into)
}

#[tracing::instrument(skip(db))]
pub async fn get_call_records_for_search_backfill(
    db: &sqlx::Pool<sqlx::Postgres>,
    limit: i64,
    offset: i64,
) -> anyhow::Result<Vec<CallRecordSearchBackfill>> {
    sqlx::query_as!(
        CallRecordSearchBackfill,
        r#"SELECT id AS "call_id!" FROM call_records ORDER BY started_at DESC LIMIT $1 OFFSET $2"#,
        limit,
        offset,
    )
    .fetch_all(db)
    .await
    .map_err(Into::into)
}

/// Returns `None` if the call has been deleted.
#[tracing::instrument(skip(db))]
pub async fn get_call_record_search_payload(
    db: &sqlx::Pool<sqlx::Postgres>,
    call_id: &Uuid,
) -> anyhow::Result<Option<CallRecordSearchPayload>> {
    let Some(header) = sqlx::query!(
        r#"
        SELECT
            cr.id AS "call_id!",
            cr.channel_id AS "channel_id!",
            cr.created_by AS "created_by!",
            cc.name AS "channel_name?"
        FROM call_records cr
        LEFT JOIN comms_channels cc ON cc.id = cr.channel_id
        WHERE cr.id = $1
        "#,
        call_id,
    )
    .fetch_optional(db)
    .await?
    else {
        return Ok(None);
    };

    let participant_ids = sqlx::query_scalar!(
        r#"
        SELECT user_id AS "user_id!"
        FROM call_record_participants
        WHERE call_record_id = $1
        ORDER BY joined_at ASC
        "#,
        call_id,
    )
    .fetch_all(db)
    .await?;

    let segments = sqlx::query_as!(
        CallRecordTranscriptSegment,
        r#"
        SELECT
            id AS "transcript_id!",
            speaker_id AS "speaker_id!",
            sequence_num AS "sequence_num!",
            content AS "content!",
            started_at AS "started_at!",
            ended_at
        FROM call_record_transcripts
        WHERE call_record_id = $1
        ORDER BY sequence_num ASC
        "#,
        call_id,
    )
    .fetch_all(db)
    .await?;

    Ok(Some(CallRecordSearchPayload {
        call_id: header.call_id,
        channel_id: header.channel_id,
        created_by: header.created_by,
        channel_name: header.channel_name,
        participant_ids,
        segments,
    }))
}

/// `user_id` drives the per-row `attended` flag.
#[tracing::instrument(skip(db))]
pub async fn get_call_records_metadata(
    db: &sqlx::Pool<sqlx::Postgres>,
    user_id: &str,
    call_ids: &[Uuid],
) -> anyhow::Result<Vec<CallRecordMetadataRow>> {
    if call_ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as!(
        CallRecordMetadataRow,
        r#"
        SELECT
            cr.id AS "call_id!",
            cr.created_by AS "created_by!",
            cr.started_at AS "started_at!",
            cr.ended_at AS "ended_at!",
            cr.duration_ms AS "duration_ms!",
            cc.name AS "channel_name?",
            EXISTS (
                SELECT 1 FROM call_record_participants crp
                WHERE crp.call_record_id = cr.id AND crp.user_id = $2
            ) AS "attended!"
        FROM call_records cr
        LEFT JOIN comms_channels cc ON cc.id = cr.channel_id
        WHERE cr.id = ANY($1)
        "#,
        call_ids,
        user_id,
    )
    .fetch_all(db)
    .await
    .map_err(Into::into)
}

#[cfg(test)]
mod access_cte_drift {
    use models_call::sql::{ACCESSIBLE_CALL_IDS_CTE, normalize};

    /// Mirror of the `WITH ... accessible_call_ids AS (...)` block inside
    /// `get_accessible_call_ids`. If you edit the live query, update this
    /// copy so the drift test still matches; the soup query in
    /// `call::outbound::pg_call_repo` has the same constant + check.
    const INLINED_CTE: &str = r#"
        WITH user_source_ids AS (
            SELECT cp.channel_id::text AS source_id
            FROM comms_channel_participants cp
            WHERE cp.user_id = $1 AND cp.left_at IS NULL
            UNION ALL
            SELECT t.team_id::text
            FROM team_user t
            WHERE t.user_id = $1
            UNION ALL
            SELECT $1
        ),
        all_calls AS (
            SELECT id, channel_id, share_permission_id
            FROM call_records
            UNION ALL
            SELECT id, channel_id, share_permission_id
            FROM calls
            WHERE $5::bool = true
        ),
        accessible_call_ids AS (
            SELECT DISTINCT ac.id AS call_id
            FROM all_calls ac
            WHERE (
                EXISTS (
                    SELECT 1 FROM entity_access ea
                    WHERE ea.entity_id = ac.id
                      AND ea.entity_type = 'call'
                      AND ea.source_id IN (SELECT source_id FROM user_source_ids)
                ) OR ($6::bool = true AND EXISTS (
                    SELECT 1 FROM "SharePermission" sp
                    WHERE sp.id = ac.share_permission_id
                      AND sp."isPublic" = true
                      AND sp."publicAccessLevel" IS NOT NULL
                ))
            )
            AND ($3::bool IS FALSE OR ac.channel_id = ANY($4))
            AND ($2::bool IS NULL OR (
                EXISTS (
                    SELECT 1 FROM call_record_participants crp
                    WHERE crp.call_record_id = ac.id AND crp.user_id = $1
                ) OR EXISTS (
                    SELECT 1 FROM call_participants cp
                    WHERE cp.call_id = ac.id AND cp.user_id = $1
                )
            ) = $2)
        )
        "#;

    #[test]
    fn cte_matches_canonical() {
        assert_eq!(
            normalize(INLINED_CTE),
            normalize(ACCESSIBLE_CALL_IDS_CTE),
            "search's inline access CTE diverged from \
             models_call::sql::ACCESSIBLE_CALL_IDS_CTE — update both sides \
             together (and the matching copy in call::outbound::pg_call_repo)",
        );
    }
}
