//! # Inbound Flag Backfill Utility
//!
//! Backfills the denormalized `email_threads.has_inbound_message` column: for
//! each user, clears the flag on every thread that holds nothing but the user's
//! own outgoing mail. The migration filled existing rows with `true` so the FE
//! kept its old `done == NOT inbox_visible` behaviour until this runs; only
//! clearing is needed here, since steady-state maintenance is handled by
//! `update_thread_metadata` in `email_db_client` and the `email` crate.
//!
//! ## Required Environment Variables:
//! - `DATABASE_URL`: The connection string for the PostgreSQL database.
//!
//! ## Optional Environment Variables:
//! - `MACRO_IDS`: Comma-separated macro IDs to backfill. When unset, every
//!   user with an email link is processed.
//! - `CONCURRENCY`: Number of users processed concurrently (defaults to 10).

mod config;
mod process;

use anyhow::Context;
use futures::stream::{self, StreamExt};
use macro_entrypoint::MacroEntrypoint;
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("Loading configuration...");
    MacroEntrypoint::default().init();
    let config = config::Config::from_env().context("Failed to load configuration")?;

    println!("Connecting to the database...");
    let db_pool = PgPoolOptions::new()
        .min_connections(1)
        .max_connections(config.concurrency as u32)
        .connect(&config.database_url)
        .await
        .context("Could not connect to db")?;

    let macro_ids: Vec<String> = match &config.macro_ids {
        Some(ids) => ids.split(',').map(|id| id.trim().to_string()).collect(),
        None => process::fetch_all_macro_ids(&db_pool)
            .await
            .context("Failed to fetch macro IDs")?,
    };

    let total_users = macro_ids.len();
    println!(
        "Processing {total_users} macro IDs with concurrency {}",
        config.concurrency
    );

    let results: Vec<(String, anyhow::Result<u64>)> = stream::iter(macro_ids)
        .map(|macro_id| {
            let db_pool = db_pool.clone();
            async move {
                let result = process::process_macro_id(&db_pool, &macro_id).await;
                (macro_id, result)
            }
        })
        .buffer_unordered(config.concurrency)
        .enumerate()
        .map(|(index, (macro_id, result))| {
            match &result {
                Ok(cleared) => println!(
                    "=== Completed {macro_id} ({}/{total_users}): cleared {cleared} threads ===",
                    index + 1
                ),
                Err(e) => println!(
                    "=== Failed {macro_id} ({}/{total_users}): {e:?} ===",
                    index + 1
                ),
            }
            (macro_id, result)
        })
        .collect()
        .await;

    let total_cleared: u64 = results.iter().filter_map(|(_, r)| r.as_ref().ok()).sum();
    let failures: Vec<&String> = results
        .iter()
        .filter(|(_, r)| r.is_err())
        .map(|(id, _)| id)
        .collect();

    println!(
        "\n=== All macro IDs processed: {total_cleared} threads cleared, {} failures ===",
        failures.len()
    );
    if !failures.is_empty() {
        anyhow::bail!(
            "{} macro IDs failed ({}); rerun to retry (already-cleared threads are skipped)",
            failures.len(),
            failures
                .iter()
                .map(|s| s.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        );
    }
    Ok(())
}
