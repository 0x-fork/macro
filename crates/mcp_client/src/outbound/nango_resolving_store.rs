use crate::domain::models::{MacroUserIdStr, McpServerRecord};
use crate::domain::ports::{McpServerStore, NangoConnectService};
use std::sync::Arc;

/// [`McpServerStore`] decorator that resolves fresh Nango access tokens into
/// records as they are loaded.
///
/// Downstream consumers ([`McpToolSet`](crate::domain::service::McpToolSet),
/// the import pipeline) connect to servers straight off the records they
/// load, so enriching at the load boundary means none of them need to know
/// Nango exists. Records without a Nango connection pass through untouched
/// and keep using their legacy stored credentials.
///
/// Token resolution failures are logged and leave the record without a
/// bearer token — one broken grant must never take down the user's other
/// connectors (or the whole chat request).
///
/// When constructed without a Nango client (Nango not configured for the
/// deployment) the decorator is a pure passthrough.
pub struct NangoResolvingStore<S, N> {
    inner: Arc<S>,
    nango: Option<Arc<N>>,
}

impl<S, N> Clone for NangoResolvingStore<S, N> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
            nango: self.nango.clone(),
        }
    }
}

/// The concrete resolving store used by hosts: Postgres rows, Nango tokens.
pub type NangoResolvingPgStore =
    NangoResolvingStore<super::pg_server_repo::PgServerRepo, super::nango::NangoClient>;

impl<S, N> NangoResolvingStore<S, N>
where
    S: McpServerStore,
    N: NangoConnectService,
{
    /// Wrap `inner`, resolving tokens through `nango` when present.
    pub fn new(inner: Arc<S>, nango: Option<Arc<N>>) -> Self {
        Self { inner, nango }
    }

    async fn resolve(&self, record: &mut McpServerRecord) {
        let Some(nango) = &self.nango else {
            return;
        };
        // Only enabled records get connected to, so only they need tokens.
        let Some(connection_id) = record.nango_connection_id.as_deref() else {
            return;
        };
        if !record.enabled {
            return;
        }

        match nango.fresh_token(connection_id).await {
            Ok(token) => record.bearer_token = Some(token),
            Err(e) => {
                tracing::warn!(
                    user_id = %record.user_id,
                    server = %record.server_name,
                    url = %record.url,
                    error = ?e,
                    "failed to resolve Nango access token"
                );
            }
        }
    }
}

impl<S, N> McpServerStore for NangoResolvingStore<S, N>
where
    S: McpServerStore,
    N: NangoConnectService,
{
    type Err = S::Err;

    async fn save(&self, record: &McpServerRecord) -> Result<(), Self::Err> {
        self.inner.save(record).await
    }

    async fn load(
        &self,
        user_id: &MacroUserIdStr<'static>,
        server_url: &str,
    ) -> Result<Option<McpServerRecord>, Self::Err> {
        let mut record = self.inner.load(user_id, server_url).await?;
        if let Some(record) = record.as_mut() {
            self.resolve(record).await;
        }
        Ok(record)
    }

    async fn delete(
        &self,
        user_id: &MacroUserIdStr<'static>,
        server_url: &str,
    ) -> Result<(), Self::Err> {
        self.inner.delete(user_id, server_url).await
    }

    async fn list(
        &self,
        user_id: &MacroUserIdStr<'static>,
    ) -> Result<Vec<McpServerRecord>, Self::Err> {
        let mut records = self.inner.list(user_id).await?;
        futures::future::join_all(records.iter_mut().map(|record| self.resolve(record))).await;
        Ok(records)
    }
}
