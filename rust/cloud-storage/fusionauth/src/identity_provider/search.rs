use std::borrow::Cow;

use crate::{
    AuthedClient, Result,
    error::{FusionAuthClientError, GenericErrorResponse},
};

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct IdentityProvider<'a> {
    id: Cow<'a, str>,
    name: Cow<'a, str>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct RetrieveIdentityProvidersResponse<'a> {
    /// All configured identity providers.
    identity_providers: Vec<IdentityProvider<'a>>,
}

/// Returns the id of the identity provider whose name matches `name` exactly.
///
/// Uses the authoritative "retrieve all identity providers" endpoint
/// (`GET /api/identity-provider`) and filters by name, rather than the
/// `/api/identity-provider/search?name=` endpoint: the search endpoint does
/// not reliably match by name in every environment (e.g. it returns no results
/// for locally-provisioned providers), whereas retrieve-all always lists every
/// configured provider.
/// https://fusionauth.io/docs/apis/identity-providers/#retrieve-all-identity-providers
/// Valid responses: 200, 401, 500
pub(crate) async fn get_idp_id_by_name(
    client: &AuthedClient,
    base_url: &str,
    name: &str,
) -> Result<String> {
    // Identity providers are global (not tenant-scoped); use the client that
    // never sends the tenant header, or the local instance returns no results.
    let res = client
        .global_client()
        .get(format!("{base_url}/api/identity-provider"))
        .send()
        .await
        .map_err(|e| {
            FusionAuthClientError::Generic(GenericErrorResponse {
                message: e.to_string(),
            })
        })?;

    if res.status() != reqwest::StatusCode::OK {
        let body = res.text().await.map_err(|e| {
            FusionAuthClientError::Generic(GenericErrorResponse {
                message: e.to_string(),
            })
        })?;

        tracing::error!(body=%body, "unexpected response from fusionauth");

        return Err(FusionAuthClientError::Generic(GenericErrorResponse {
            message: body,
        }));
    }

    let body = res
        .json::<RetrieveIdentityProvidersResponse>()
        .await
        .map_err(|e| {
            FusionAuthClientError::Generic(GenericErrorResponse {
                message: e.to_string(),
            })
        })?;

    let providers = body.identity_providers;
    let mut matches = providers.iter().filter(|idp| idp.name == name);

    let Some(first) = matches.next() else {
        let available = providers.iter().map(|p| p.name.as_ref()).collect::<Vec<_>>();
        tracing::warn!(
            requested = %name,
            available = ?available,
            "no identity provider matched the requested name (retrieve-all)"
        );
        return Err(FusionAuthClientError::NoIdentityProviderFound);
    };

    if matches.next().is_some() {
        return Err(FusionAuthClientError::Generic(GenericErrorResponse {
            message: format!("multiple identity providers found with name {name}"),
        }));
    }

    Ok(first.id.to_string())
}
