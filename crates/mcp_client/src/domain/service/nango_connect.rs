use crate::domain::models::{MacroUserIdStr, McpServerRecord};
use crate::domain::ports::{McpServerStore, NangoConnectService};

#[cfg(test)]
mod test;

/// Errors from completing a Nango-managed MCP connection.
#[derive(Debug, thiserror::Error)]
pub enum NangoConnectError {
    /// The connection does not exist in Nango or belongs to another user.
    ///
    /// The two cases are deliberately indistinguishable so a caller cannot
    /// probe for other users' connection IDs.
    #[error("connection not found")]
    NotFound,
    /// The connection exists but records no MCP server URL, so there is
    /// nothing to attach it to.
    #[error("connection has no MCP server URL")]
    MissingServerUrl,
    /// Talking to Nango or the store failed.
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// Attach a freshly authorized Nango connection to the user's MCP servers.
///
/// Verifies with Nango that `connection_id` exists and was created for this
/// user, then upserts the corresponding `mcp_servers` row. An existing row
/// for the same URL keeps its name and enabled state (only the grant is
/// replaced); a new row is created enabled, named after `server_name` or the
/// server's host as a fallback.
#[tracing::instrument(skip(store, nango), err)]
pub async fn complete_nango_connection<S, N>(
    store: &S,
    nango: &N,
    user_id: &MacroUserIdStr<'static>,
    connection_id: &str,
    server_name: Option<String>,
) -> Result<McpServerRecord, NangoConnectError>
where
    S: McpServerStore,
    N: NangoConnectService,
    anyhow::Error: From<S::Err>,
{
    let connection = nango
        .get_connection(connection_id)
        .await?
        .ok_or(NangoConnectError::NotFound)?;

    // Ownership check: the connection must have been created through a
    // Connect session minted for this user.
    if connection.end_user_id.as_deref() != Some(user_id.as_ref()) {
        return Err(NangoConnectError::NotFound);
    }

    let url = connection
        .mcp_server_url
        .ok_or(NangoConnectError::MissingServerUrl)?;

    let existing = store
        .load(user_id, &url)
        .await
        .map_err(anyhow::Error::from)?;

    let record = match existing {
        Some(mut record) => {
            record.nango_connection_id = Some(connection.connection_id);
            if let Some(name) = server_name {
                record.server_name = name;
            }
            record
        }
        None => McpServerRecord {
            user_id: user_id.clone(),
            server_name: server_name.unwrap_or_else(|| host_name(&url)),
            url,
            credentials: None,
            enabled: true,
            nango_connection_id: Some(connection.connection_id),
            bearer_token: None,
        },
    };

    store.save(&record).await.map_err(anyhow::Error::from)?;

    Ok(record)
}

/// Fallback display name for a server: its host, or the raw URL when it
/// doesn't parse.
fn host_name(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned))
        .unwrap_or_else(|| url.to_owned())
}

/// Remove an MCP server, revoking its Nango-managed grant when it has one.
///
/// The Nango deletion is best effort: failing to clean up remotely must not
/// strand the local row, so remote failures are logged and the local delete
/// proceeds.
#[tracing::instrument(skip(store, nango), err)]
pub async fn disconnect_mcp_server<S, N>(
    store: &S,
    nango: Option<&N>,
    user_id: &MacroUserIdStr<'static>,
    url: &str,
) -> anyhow::Result<()>
where
    S: McpServerStore,
    N: NangoConnectService,
    anyhow::Error: From<S::Err>,
{
    if let Some(nango) = nango {
        let record = store
            .load(user_id, url)
            .await
            .map_err(anyhow::Error::from)?;
        if let Some(connection_id) = record.and_then(|r| r.nango_connection_id)
            && let Err(e) = nango.delete_connection(&connection_id).await
        {
            tracing::warn!(error = ?e, connection_id, "failed to delete Nango connection");
        }
    }

    store
        .delete(user_id, url)
        .await
        .map_err(anyhow::Error::from)?;

    Ok(())
}
