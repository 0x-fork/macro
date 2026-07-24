use sqlx::types::Uuid;

/// Clears `has_inbound_message` on every thread of one of the user's links that
/// holds nothing but the user's own outgoing mail. One statement per link keeps
/// transactions small and the progress output per-mailbox. Returns the number of
/// threads cleared.
///
/// The migration filled existing rows with `true` to preserve the old
/// `done == NOT inbox_visible` behaviour, so this pass only ever clears; setting
/// the flag is handled by `update_thread_metadata` in `email_db_client` and the
/// `email` crate. The inbound predicate mirrors
/// `models_email::email::service::message::is_inbound_origin`: a message is
/// inbound unless the user wrote it, and one they addressed to themselves counts.
pub async fn process_macro_id(pool: &sqlx::PgPool, macro_id: &str) -> anyhow::Result<u64> {
    let link_ids: Vec<Uuid> =
        sqlx::query_scalar!("SELECT id FROM email_links WHERE macro_id = $1", macro_id)
            .fetch_all(pool)
            .await?;

    if link_ids.is_empty() {
        println!("No email links found for {macro_id}.");
        return Ok(0);
    }

    let mut total_cleared = 0u64;
    for link_id in link_ids {
        let cleared = sqlx::query!(
            r#"
            UPDATE email_threads t
            SET has_inbound_message = false
            WHERE t.link_id = $1
              AND t.has_inbound_message
              AND NOT EXISTS (
                  SELECT 1
                  FROM email_messages m
                  WHERE m.thread_id = t.id
                    AND (
                        (NOT m.is_sent AND NOT m.is_draft)
                        OR EXISTS (
                            SELECT 1
                            FROM email_message_recipients r
                            WHERE r.message_id = m.id
                              AND m.from_contact_id IS NOT NULL
                              AND r.contact_id = m.from_contact_id
                        )
                    )
              )
            "#,
            link_id
        )
        .execute(pool)
        .await?
        .rows_affected();

        // Prefix with the user so interleaved concurrent output stays readable.
        println!("[{macro_id}] link {link_id}: cleared {cleared} threads");
        total_cleared += cleared;
    }

    Ok(total_cleared)
}

/// Every macro ID that owns at least one email link. Connected secondary
/// mailboxes carry their own macro_id row in email_links, so iterating these
/// covers every link exactly once.
pub async fn fetch_all_macro_ids(pool: &sqlx::PgPool) -> anyhow::Result<Vec<String>> {
    Ok(
        sqlx::query_scalar!("SELECT DISTINCT macro_id FROM email_links ORDER BY macro_id")
            .fetch_all(pool)
            .await?,
    )
}
