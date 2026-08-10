use super::*;
use crate::domain::models::RefreshToken;
use crate::domain::ports::TokenPairFuture;

struct NoOpInflightStore;

impl InflightAuthStore for NoOpInflightStore {
    fn insert_pending(
        &self,
        _session_id: &str,
        _pending: PendingAuthorization,
    ) -> impl Future<Output = anyhow::Result<()>> + Send {
        async { Ok(()) }
    }

    fn take_pending(
        &self,
        _session_id: &str,
    ) -> impl Future<Output = anyhow::Result<Option<PendingAuthorization>>> + Send {
        async { Ok(None) }
    }

    fn insert_issued(
        &self,
        _code: &str,
        _issued: IssuedAuthorizationCode,
    ) -> impl Future<Output = anyhow::Result<()>> + Send {
        async { Ok(()) }
    }

    fn take_issued(
        &self,
        _code: &str,
    ) -> impl Future<Output = anyhow::Result<Option<IssuedAuthorizationCode>>> + Send {
        async { Ok(None) }
    }

    fn cleanup_expired(&self) -> impl Future<Output = anyhow::Result<()>> + Send {
        async { Ok(()) }
    }
}

struct NoOpOAuthProvider;

impl OAuthProvider for NoOpOAuthProvider {
    fn construct_authorize_url(&self, _state: &str) -> anyhow::Result<String> {
        anyhow::bail!("not used in metadata tests")
    }

    fn exchange_authorization_code<'a>(&'a self, _code: &'a str) -> TokenPairFuture<'a> {
        Box::pin(async { anyhow::bail!("not used in metadata tests") })
    }

    fn refresh_access_token<'a>(&'a self, _refresh_token: &'a RefreshToken) -> TokenPairFuture<'a> {
        Box::pin(async { anyhow::bail!("not used in metadata tests") })
    }
}

fn metadata_service() -> McpAuthProxyServiceImpl<NoOpInflightStore> {
    McpAuthProxyServiceImpl::new(
        "https://mcp-server.macro.com".to_owned(),
        Arc::new(NoOpInflightStore),
        Arc::new(NoOpOAuthProvider),
    )
}

#[test]
fn protected_resource_metadata_identifies_the_mcp_resource() {
    let metadata = metadata_service().protected_resource_metadata();

    // RFC 9728: `resource` is required and must be the canonical URI of the
    // protected MCP endpoint.
    assert_eq!(
        metadata["resource"],
        serde_json::json!("https://mcp-server.macro.com/mcp")
    );
    assert_eq!(
        metadata["authorization_servers"],
        serde_json::json!(["https://mcp-server.macro.com"])
    );
    assert_eq!(
        metadata["bearer_methods_supported"],
        serde_json::json!(["header"])
    );
}

#[test]
fn authorization_server_metadata_advertises_public_client_support() {
    let metadata = metadata_service().authorization_server_metadata();

    assert_eq!(
        metadata["issuer"],
        serde_json::json!("https://mcp-server.macro.com")
    );
    assert_eq!(
        metadata["code_challenge_methods_supported"],
        serde_json::json!(["S256"])
    );
    assert_eq!(
        metadata["grant_types_supported"],
        serde_json::json!(["authorization_code", "refresh_token"])
    );
    assert_eq!(
        metadata["token_endpoint_auth_methods_supported"],
        serde_json::json!(["none"])
    );
}
