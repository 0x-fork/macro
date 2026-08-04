use super::*;
use crate::domain::ports::EmailUserRepo;

const LINK_ONE: Uuid = Uuid::from_u128(0xaaaaaaaa_aaaa_aaaa_aaaa_aaaaaaaaaaaa);
const LINK_TWO: Uuid = Uuid::from_u128(0xbbbbbbbb_bbbb_bbbb_bbbb_bbbbbbbbbbbb);

/// Adds a second inbox alongside the fixture's, so the grouping is exercised
/// with more than one link in play.
async fn insert_second_link(pool: &Pool<Postgres>) -> anyhow::Result<()> {
    sqlx::query!(
        r#"
        INSERT INTO email_links (id, macro_id, fusionauth_user_id, email_address,
                                 provider, is_sync_active, created_at, updated_at)
        VALUES ($1, 'macro|user2@test.com', 'fa-user-2', 'user2@test.com', 'GMAIL', true, NOW(), NOW())
        "#,
        LINK_TWO
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Inserts one thread with the exact column combination the Signal-view count
/// discriminates on.
#[allow(clippy::too_many_arguments)]
async fn insert_thread(
    pool: &Pool<Postgres>,
    id: Uuid,
    link_id: Uuid,
    inbox_visible: bool,
    is_read: bool,
    is_signal: bool,
    has_inbound: bool,
) -> anyhow::Result<()> {
    sqlx::query!(
        r#"
        INSERT INTO email_threads (id, provider_id, link_id, inbox_visible, is_read,
                                   is_signal, latest_inbound_message_ts, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6,
                CASE WHEN $7 THEN NOW() ELSE NULL END, NOW(), NOW())
        "#,
        id,
        id.to_string(),
        link_id,
        inbox_visible,
        is_read,
        is_signal,
        has_inbound
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Clears the fixture's own threads so each case counts only what it inserts.
async fn clear_threads(pool: &Pool<Postgres>) -> anyhow::Result<()> {
    sqlx::query!("DELETE FROM email_messages")
        .execute(pool)
        .await?;
    sqlx::query!("DELETE FROM email_threads")
        .execute(pool)
        .await?;
    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../../fixtures", scripts("email_message"))
)]
async fn unread_signal_counts_group_by_link(pool: Pool<Postgres>) -> anyhow::Result<()> {
    clear_threads(&pool).await?;
    insert_second_link(&pool).await?;

    insert_thread(&pool, Uuid::from_u128(1), LINK_ONE, true, false, true, true).await?;
    insert_thread(&pool, Uuid::from_u128(2), LINK_ONE, true, false, true, true).await?;
    insert_thread(&pool, Uuid::from_u128(3), LINK_TWO, true, false, true, true).await?;

    let repo = EmailPgRepo::new(pool);
    let mut counts = repo
        .unread_signal_counts_for_links(&[LINK_ONE, LINK_TWO])
        .await?;
    counts.sort_by_key(|count| count.link_id);

    assert_eq!(counts.len(), 2);
    assert_eq!(counts[0].link_id, LINK_ONE);
    assert_eq!(counts[0].unread_count, 2);
    assert_eq!(counts[1].link_id, LINK_TWO);
    assert_eq!(counts[1].unread_count, 1);

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../../fixtures", scripts("email_message"))
)]
async fn unread_signal_counts_exclude_read_noise_archived_and_outbound_only_threads(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    clear_threads(&pool).await?;

    // The one thread that should be counted.
    insert_thread(&pool, Uuid::from_u128(1), LINK_ONE, true, false, true, true).await?;
    // Read.
    insert_thread(&pool, Uuid::from_u128(2), LINK_ONE, true, true, true, true).await?;
    // Noise — deliberately not counted, the badge tracks Signal only.
    insert_thread(
        &pool,
        Uuid::from_u128(3),
        LINK_ONE,
        true,
        false,
        false,
        true,
    )
    .await?;
    // Archived out of the inbox view.
    insert_thread(
        &pool,
        Uuid::from_u128(4),
        LINK_ONE,
        false,
        false,
        true,
        true,
    )
    .await?;
    // No inbound message, so the inbox view never surfaces it.
    insert_thread(
        &pool,
        Uuid::from_u128(5),
        LINK_ONE,
        true,
        false,
        true,
        false,
    )
    .await?;

    let repo = EmailPgRepo::new(pool);
    let counts = repo.unread_signal_counts_for_links(&[LINK_ONE]).await?;

    assert_eq!(counts.len(), 1);
    assert_eq!(counts[0].unread_count, 1);

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../../fixtures", scripts("email_message"))
)]
async fn unread_signal_counts_omit_links_with_nothing_unread(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    clear_threads(&pool).await?;
    insert_second_link(&pool).await?;

    insert_thread(&pool, Uuid::from_u128(1), LINK_ONE, true, false, true, true).await?;

    let repo = EmailPgRepo::new(pool);
    let counts = repo
        .unread_signal_counts_for_links(&[LINK_ONE, LINK_TWO])
        .await?;

    // Zero-filling is the domain service's job — the repo just omits LINK_TWO.
    assert_eq!(counts.len(), 1);
    assert_eq!(counts[0].link_id, LINK_ONE);

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../../../fixtures", scripts("email_message"))
)]
async fn unread_signal_counts_ignore_threads_outside_the_requested_links(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    clear_threads(&pool).await?;
    insert_second_link(&pool).await?;

    insert_thread(&pool, Uuid::from_u128(1), LINK_ONE, true, false, true, true).await?;
    insert_thread(&pool, Uuid::from_u128(2), LINK_TWO, true, false, true, true).await?;

    let repo = EmailPgRepo::new(pool);
    let counts = repo.unread_signal_counts_for_links(&[LINK_TWO]).await?;

    assert_eq!(counts.len(), 1);
    assert_eq!(counts[0].link_id, LINK_TWO);
    assert_eq!(counts[0].unread_count, 1);

    Ok(())
}
