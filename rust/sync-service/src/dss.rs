use tracing::{error, warn};
use wasm_bindgen::JsValue;
use worker::{Fetch, Headers, Method, Request, RequestInit, Result};

use crate::{constants::header_names::MACRO_INTERNAL_AUTH_KEY_HEADER_KEY, secrets::Secrets};

const DSS_URL_VAR: &str = "DSS_URL";
const VERSION_ID_HEADER: &str = "x-sync-service-version-id";
const SNAPSHOT_UPDATED_AT_MS_HEADER: &str = "x-sync-service-snapshot-updated-at-ms";
const BUMP_UPDATED_AT_HEADER: &str = "x-sync-service-bump-updated-at";

/// Mirrors a sync-service Loro snapshot into DSS/S3 and updates DSS metadata.
///
/// This writeback is deliberately repairable. Callers should log failures but should not treat DSS
/// cache write failures as sync-service persistence failures.
#[tracing::instrument(skip(env, snapshot), fields(document_id = %document_id, snapshot_len = snapshot.len(), bump_updated_at = bump_updated_at))]
pub async fn put_sync_snapshot(
    env: &worker::Env,
    document_id: &str,
    version_id: &str,
    snapshot_updated_at_ms: i64,
    snapshot: &[u8],
    bump_updated_at: bool,
) -> Result<()> {
    let dss_url = match env.var(DSS_URL_VAR) {
        Ok(value) => value.to_string(),
        Err(err) => {
            warn!(error=?err, "DSS_URL is not configured; skipping DSS sync snapshot writeback");
            return Ok(());
        }
    };

    let internal_auth_key = Secrets::from(env).dss_internal_api_secret;
    let url = format!(
        "{}/internal/sync_service/documents/{}/snapshot",
        dss_url.trim_end_matches('/'),
        document_id,
    );

    let headers = Headers::new();
    headers.set("content-type", "application/octet-stream")?;
    headers.set(MACRO_INTERNAL_AUTH_KEY_HEADER_KEY, &internal_auth_key)?;
    headers.set(VERSION_ID_HEADER, version_id)?;
    headers.set(
        SNAPSHOT_UPDATED_AT_MS_HEADER,
        &snapshot_updated_at_ms.to_string(),
    )?;
    headers.set(
        BUMP_UPDATED_AT_HEADER,
        if bump_updated_at { "true" } else { "false" },
    )?;

    let mut init = RequestInit::new();
    init.with_method(Method::Put)
        .with_headers(headers)
        .with_body(Some(JsValue::from(snapshot.to_vec())));

    let request = Request::new_with_init(&url, &init)?;
    let mut response = Fetch::Request(request).send().await?;

    if !(200..300).contains(&response.status_code()) {
        let status = response.status_code();
        let body = response
            .text()
            .await
            .unwrap_or_else(|err| format!("<failed to read body: {err:?}>"));
        error!(status = status, body = %body, "DSS sync snapshot writeback returned non-2xx");
        return Err(worker::Error::from(format!(
            "DSS sync snapshot writeback failed with status {status}"
        )));
    }

    Ok(())
}
