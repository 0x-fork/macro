//! Installation event handlers.

use crate::domain::{
    models::{GithubAppInstallationSource, GithubError, ValidatedGithubWebhookEvent},
    ports::{GithubSyncClient, GithubSyncRepo},
};
use documents::domain::ports::DocumentService;
use foreign_entity::domain::ports::ForeignEntityService;
use notification::domain::service::NotificationIngress;

use super::GithubSyncServiceImpl;

impl<
    D: DocumentService,
    R: GithubSyncRepo,
    C: GithubSyncClient,
    F: ForeignEntityService,
    N: NotificationIngress,
> GithubSyncServiceImpl<D, R, C, F, N>
{
    /// Handle `installation` events with action `created`.
    ///
    /// Associates the GitHub App installation with the installer's team or user source.
    #[tracing::instrument(skip(self, event), err)]
    pub(crate) async fn handle_installation_created(
        &self,
        event: &ValidatedGithubWebhookEvent,
    ) -> Result<(), GithubError> {
        let installation_id = event
            .installation_id()
            .ok_or_else(|| GithubError::Internal(anyhow::anyhow!("missing installation.id")))?;

        let sender_github_user_id = event.sender_github_user_id().ok_or_else(|| {
            GithubError::Internal(anyhow::anyhow!("missing sender.id in installation event"))
        })?;

        tracing::info!(installation_id, "processing installation created event");

        // Always record the installer, even when no link exists yet: it lets a
        // later github_links creation associate this installation retroactively.
        self.repo
            .upsert_installation_installer(&installation_id.to_string(), &sender_github_user_id)
            .await
            .map_err(|e| GithubError::Internal(e.into()))?;

        let source = self.source_for_github_user(&sender_github_user_id).await?;
        if source.is_none() {
            tracing::warn!(
                installation_id,
                "GitHub identity does not resolve to exactly one Macro source; disabling installation"
            );
        }

        self.associate_installation_with_source(installation_id, source.as_ref())
            .await
    }

    /// Resolve a GitHub identity to exactly one Macro source.
    ///
    /// A shared GitHub identity or a Macro user in multiple teams is
    /// ambiguous. Those cases fail closed until the install flow can bind an
    /// installation to an explicitly selected Macro source.
    pub(crate) async fn source_for_github_user(
        &self,
        github_user_id: &str,
    ) -> Result<Option<GithubAppInstallationSource>, GithubError> {
        let links = self
            .repo
            .get_macro_ids_by_github_user_ids(std::slice::from_ref(&github_user_id.to_string()))
            .await
            .map_err(|e| GithubError::Internal(e.into()))?;

        let mut macro_ids = links.get(github_user_id).cloned().unwrap_or_default();
        macro_ids.sort();
        macro_ids.dedup();

        let [macro_id] = macro_ids.as_slice() else {
            if macro_ids.len() > 1 {
                tracing::warn!(
                    github_user_id,
                    macro_user_count = macro_ids.len(),
                    "GitHub identity is linked to multiple Macro users"
                );
            }
            return Ok(None);
        };

        let mut team_ids = self
            .repo
            .get_user_team_ids(macro_id)
            .await
            .map_err(|e| GithubError::Internal(e.into()))?;
        team_ids.sort();
        team_ids.dedup();

        match team_ids.as_slice() {
            [] => Ok(Some(GithubAppInstallationSource::User(macro_id.clone()))),
            [team_id] => Ok(Some(GithubAppInstallationSource::Team(*team_id))),
            _ => {
                tracing::warn!(
                    github_user_id,
                    macro_id,
                    team_count = team_ids.len(),
                    "Macro user belongs to multiple teams; installation source is ambiguous"
                );
                Ok(None)
            }
        }
    }

    /// Replace the installation's source association and backfill only when it
    /// resolves to a single source.
    pub(crate) async fn associate_installation_with_source(
        &self,
        installation_id: u64,
        source: Option<&GithubAppInstallationSource>,
    ) -> Result<(), GithubError> {
        let sources = source.map(std::slice::from_ref).unwrap_or_default();
        self.repo
            .replace_installation_sources(&installation_id.to_string(), sources)
            .await
            .map_err(|e| GithubError::Internal(e.into()))?;

        if let Some(source) = source {
            self.backfill_open_pull_request_foreign_entities(
                installation_id,
                std::slice::from_ref(source),
            )
            .await?;
        }

        Ok(())
    }

    /// Handle an installation deletion by removing all local associations.
    #[tracing::instrument(skip(self, event), err)]
    pub(crate) async fn handle_installation_deleted(
        &self,
        event: &ValidatedGithubWebhookEvent,
    ) -> Result<(), GithubError> {
        let installation_id = event
            .installation_id()
            .ok_or_else(|| GithubError::Internal(anyhow::anyhow!("missing installation.id")))?;

        self.repo
            .delete_installation(&installation_id.to_string())
            .await
            .map_err(|error| GithubError::Internal(error.into()))
    }
}
