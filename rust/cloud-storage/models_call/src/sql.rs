//! Canonical SQL fragment for the "calls a user can see" predicate.
//!
//! Two consumers need this fragment: the soup feed (in `call`'s outbound
//! adapter) and search (in `macro_db_client::call_record::get`). They
//! must produce the same result for the same `(user, attended, channel,
//! include_active, include_public_share)` inputs — drift would let the
//! two paths show different access answers for the same user.
//!
//! sqlx's `query!`/`query_scalar!` proc macros require their SQL to be a
//! single string literal at the macro call site — `concat!`,
//! `include_str!`, and `macro_rules!` indirection are all rejected
//! ("expected string literal"). So the CTE is physically pasted into
//! both consumers' `query!` invocations.
//!
//! [`ACCESSIBLE_CALL_IDS_CTE`] is the canonical text. Each consumer has a
//! `#[cfg(test)]` test that compares its inline SQL against this constant
//! with whitespace normalized; any divergence fails the test.
//!
//! ## Required bind parameters
//!
//! When pasted into a query, the fragment references these bind
//! parameters (callers must provide them in this order before any of
//! their own placeholders):
//!
//! - `$1` — `&str` user id
//! - `$2` — `Option<bool>` attended filter (None skips, Some(b) keeps
//!   only calls where the user did/didn't participate)
//! - `$3` — `bool` whether `$4` is non-empty (channel filter on/off)
//! - `$4` — `&[Uuid]` channel ids
//! - `$5` — `bool` include active calls (`true`) or archived only (`false`)
//! - `$6` — `bool` include public-share matches alongside entity_access
//!
//! The CTE exposes a relation `accessible_call_ids` with one column
//! `call_id Uuid`.

/// Canonical `WITH` block defining `accessible_call_ids` for use in call
/// access queries. See module docs for usage.
pub const ACCESSIBLE_CALL_IDS_CTE: &str = r#"
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

/// Normalize a SQL fragment for drift comparison: collapse all
/// whitespace runs to a single space and trim. Use this in the
/// per-consumer drift tests rather than asserting on the raw text so
/// reformatting / indentation differences don't cause spurious failures.
pub fn normalize(sql: &str) -> String {
    sql.split_whitespace().collect::<Vec<_>>().join(" ")
}
