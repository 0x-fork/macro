use super::*;
use crate::domain::models::{ThreadDeltaDigest, ThreadDeltaQuery};

const LINK_A: &str = "aaaaaaaa-0000-0000-0000-00000000000a";
const LINK_B: &str = "bbbbbbbb-0000-0000-0000-00000000000b";
const T1: &str = "00000000-0000-0000-0000-000000000001";
const T2: &str = "00000000-0000-0000-0000-000000000002";
const T3: &str = "00000000-0000-0000-0000-000000000003";
const T4: &str = "00000000-0000-0000-0000-000000000004";
const TB1: &str = "00000000-0000-0000-0000-0000000000b1";
const MSG_1: &str = "e0000000-0000-0000-0000-000000000001";

fn delta_query(
    link_ids: Vec<Uuid>,
    since: chrono::DateTime<Utc>,
    descending: bool,
    limit: u32,
) -> ThreadDeltaQuery {
    ThreadDeltaQuery {
        link_ids,
        query: Query::Sort(SimpleSortMethod::UpdatedAt, ()),
        since,
        descending,
        limit,
    }
}

fn ids(digests: &[ThreadDeltaDigest]) -> Vec<String> {
    digests.iter().map(|d| d.thread_id.to_string()).collect()
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../../fixtures", scripts("email_delta"))
)]
async fn test_thread_delta_since_is_inclusive_and_ascending(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let repo = EmailPgRepo::new(pool);
    let link_a = Uuid::parse_str(LINK_A)?;

    // since == T2's watermark: T2 must be included (boundary duplicates are
    // preferred over boundary gaps), T1 excluded, tie T3/T4 ordered by id.
    let since = Utc.with_ymd_and_hms(2025, 3, 2, 0, 0, 0).unwrap();
    let digests = repo
        .thread_delta(&delta_query(vec![link_a], since, false, 100))
        .await?;

    assert_eq!(ids(&digests), vec![T2, T3, T4]);
    assert!(digests[0].watermark <= digests[1].watermark);
    assert_eq!(digests[0].link_id, link_a);

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../../fixtures", scripts("email_delta"))
)]
async fn test_thread_delta_keyset_pagination_walks_ties(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let repo = EmailPgRepo::new(pool);
    let link_a = Uuid::parse_str(LINK_A)?;
    let since = Utc.with_ymd_and_hms(2025, 1, 1, 0, 0, 0).unwrap();

    // Page 1: limit 2 → T1, T2.
    let page1 = repo
        .thread_delta(&delta_query(vec![link_a], since, false, 2))
        .await?;
    assert_eq!(ids(&page1), vec![T1, T2]);

    // Page 2 resumes from T2's (watermark, id): the T3/T4 tie must come back
    // in id order.
    let last = page1.last().unwrap();
    let cursor_query = ThreadDeltaQuery {
        link_ids: vec![link_a],
        query: Query::Cursor(Cursor {
            id: last.thread_id,
            limit: 2,
            val: CursorVal {
                sort_type: SimpleSortMethod::UpdatedAt,
                last_val: last.watermark,
            },
            filter: (),
        }),
        since,
        descending: false,
        limit: 2,
    };
    let page2 = repo.thread_delta(&cursor_query).await?;
    assert_eq!(ids(&page2), vec![T3, T4]);

    // Page 3 resumes from mid-tie (T3) and must return only T4.
    let last = page2.first().unwrap();
    let cursor_query = ThreadDeltaQuery {
        link_ids: vec![link_a],
        query: Query::Cursor(Cursor {
            id: last.thread_id,
            limit: 2,
            val: CursorVal {
                sort_type: SimpleSortMethod::UpdatedAt,
                last_val: last.watermark,
            },
            filter: (),
        }),
        since,
        descending: false,
        limit: 2,
    };
    let page3 = repo.thread_delta(&cursor_query).await?;
    assert_eq!(ids(&page3), vec![T4]);

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../../fixtures", scripts("email_delta"))
)]
async fn test_thread_delta_descending_and_cursor(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let repo = EmailPgRepo::new(pool);
    let link_a = Uuid::parse_str(LINK_A)?;
    let since = Utc.with_ymd_and_hms(2025, 1, 1, 0, 0, 0).unwrap();

    // Newest first; the T3/T4 tie breaks by id descending.
    let page1 = repo
        .thread_delta(&delta_query(vec![link_a], since, true, 3))
        .await?;
    assert_eq!(ids(&page1), vec![T4, T3, T2]);

    let last = page1.last().unwrap();
    let cursor_query = ThreadDeltaQuery {
        link_ids: vec![link_a],
        query: Query::Cursor(Cursor {
            id: last.thread_id,
            limit: 3,
            val: CursorVal {
                sort_type: SimpleSortMethod::UpdatedAt,
                last_val: last.watermark,
            },
            filter: (),
        }),
        since,
        descending: true,
        limit: 3,
    };
    let page2 = repo.thread_delta(&cursor_query).await?;
    assert_eq!(ids(&page2), vec![T1]);

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../../fixtures", scripts("email_delta"))
)]
async fn test_thread_delta_scopes_to_requested_links(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let repo = EmailPgRepo::new(pool);
    let link_a = Uuid::parse_str(LINK_A)?;
    let link_b = Uuid::parse_str(LINK_B)?;
    let since = Utc.with_ymd_and_hms(2025, 1, 1, 0, 0, 0).unwrap();

    // Only link B's thread when scoped to B.
    let only_b = repo
        .thread_delta(&delta_query(vec![link_b], since, false, 100))
        .await?;
    assert_eq!(ids(&only_b), vec![TB1]);

    // Both links interleave by watermark: TB1 (03-02 12:00) lands between
    // T2 (03-02) and T3 (03-03).
    let both = repo
        .thread_delta(&delta_query(vec![link_a, link_b], since, false, 100))
        .await?;
    assert_eq!(ids(&both), vec![T1, T2, TB1, T3, T4]);

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../../fixtures", scripts("email_delta"))
)]
async fn test_label_and_read_mutations_bump_the_thread_watermark(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let repo = EmailPgRepo::new(pool);
    let link_a = Uuid::parse_str(LINK_A)?;
    let t1 = Uuid::parse_str(T1)?;
    let msg = Uuid::parse_str(MSG_1)?;

    // Nothing in the fixture is newer than 2026-01-01.
    let since = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap();
    let before = repo
        .thread_delta(&delta_query(vec![link_a], since, false, 100))
        .await?;
    assert!(before.is_empty());

    // Adding a label must surface T1 in the feed (the bump is what makes
    // label changes visible to the delta sync at all).
    repo.insert_message_labels_batch(&[msg], "IMPORTANT", link_a)
        .await?;
    let after_label = repo
        .thread_delta(&delta_query(vec![link_a], since, false, 100))
        .await?;
    assert_eq!(ids(&after_label), vec![T1]);

    // Removing it bumps again.
    let watermark_after_label = after_label[0].watermark;
    repo.delete_message_labels_batch(&[msg], "IMPORTANT", link_a)
        .await?;
    let after_unlabel = repo
        .thread_delta(&delta_query(vec![link_a], since, false, 100))
        .await?;
    assert_eq!(ids(&after_unlabel), vec![T1]);
    assert!(after_unlabel[0].watermark >= watermark_after_label);

    // Read-status flips bump too.
    let t1_watermark = after_unlabel[0].watermark;
    repo.update_message_read_status_batch(&[msg], link_a, true)
        .await?;
    let after_read = repo
        .thread_delta(&delta_query(vec![link_a], since, false, 100))
        .await?;
    assert_eq!(after_read[0].thread_id, t1);
    assert!(after_read[0].watermark >= t1_watermark);

    // Starred flips bump too.
    repo.update_message_starred_status_batch(&[msg], link_a, true)
        .await?;
    let after_star = repo
        .thread_delta(&delta_query(vec![link_a], since, false, 100))
        .await?;
    assert_eq!(after_star[0].thread_id, t1);

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../../fixtures", scripts("email_delta"))
)]
async fn test_noop_label_mutations_do_not_bump_the_watermark(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let repo = EmailPgRepo::new(pool);
    let link_a = Uuid::parse_str(LINK_A)?;
    let msg = Uuid::parse_str(MSG_1)?;
    let since = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap();

    // Deleting a label the message doesn't have changes nothing, so the
    // thread must not surface in the feed (no gratuitous re-hydrations).
    repo.delete_message_labels_batch(&[msg], "IMPORTANT", link_a)
        .await?;
    let after_noop_delete = repo
        .thread_delta(&delta_query(vec![link_a], since, false, 100))
        .await?;
    assert!(after_noop_delete.is_empty());

    // Inserting the same label twice: the second (conflicting) insert
    // changes nothing and must not bump.
    repo.insert_message_labels_batch(&[msg], "IMPORTANT", link_a)
        .await?;
    let bumped = repo
        .thread_delta(&delta_query(vec![link_a], since, false, 100))
        .await?;
    let first_watermark = bumped[0].watermark;

    repo.insert_message_labels_batch(&[msg], "IMPORTANT", link_a)
        .await?;
    let after_noop_insert = repo
        .thread_delta(&delta_query(vec![link_a], since, false, 100))
        .await?;
    assert_eq!(after_noop_insert[0].watermark, first_watermark);

    Ok(())
}
