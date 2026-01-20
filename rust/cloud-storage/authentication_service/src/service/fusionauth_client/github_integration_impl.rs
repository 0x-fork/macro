use std::borrow::Cow;

use crate::service::fusionauth_client::{
    FusionAuthClient,
    identity_provider::{IdentityProviderLink as FusionAuthIdentityProviderLink, LinkUserRequest},
};

#[async_trait::async_trait]
impl github_integration::FusionAuthLinking for FusionAuthClient {
    async fn link_user(
        &self,
        user_id: &str,
        identity_provider_id: &str,
        identity_provider_user_id: &str,
        display_name: &str,
        token: &str,
    ) -> anyhow::Result<()> {
        let request = LinkUserRequest {
            identity_provider_link: FusionAuthIdentityProviderLink {
                display_name: Cow::Borrowed(display_name),
                identity_provider_id: Cow::Borrowed(identity_provider_id),
                identity_provider_user_id: Cow::Borrowed(identity_provider_user_id),
                user_id: Cow::Borrowed(user_id),
                token: Cow::Borrowed(token),
            },
        };

        self.link_user(request).await.map_err(|e| anyhow::anyhow!(e.to_string()))
    }

    async fn unlink_user(
        &self,
        user_id: &str,
        identity_provider_id: &str,
        identity_provider_user_id: &str,
    ) -> anyhow::Result<()> {
        self.unlink_user(user_id, identity_provider_id, identity_provider_user_id)
            .await
            .map_err(|e| anyhow::anyhow!(e.to_string()))
    }

    async fn get_links(
        &self,
        user_id: &str,
        identity_provider_id: Option<&str>,
    ) -> anyhow::Result<Vec<github_integration::IdentityProviderLink>> {
        let links = self.get_links(user_id, identity_provider_id.map(String::from))
            .await
            .map_err(|e| anyhow::anyhow!(e.to_string()))?;

        Ok(links
            .into_iter()
            .map(|link| github_integration::IdentityProviderLink {
                display_name: link.display_name,
                identity_provider_id: link.identity_provider_id,
                identity_provider_user_id: link.identity_provider_user_id,
                token: link.token,
                user_id: link.user_id,
            })
            .collect())
    }
}
