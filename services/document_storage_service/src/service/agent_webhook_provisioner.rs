//! Adapter implementing the bots crate's [`AgentWebhookProvisioner`] port
//! over the webhook management service.
//!
//! Lives in the composition root because the bots and webhook crates must not
//! depend on each other in this direction: webhook ingestion already consumes
//! the bots crate's `channel.bot-mentioned` events.

use bots::domain::models::{AgentWebhook, BotEventKind, BotOwner};
use bots::domain::ports::{
    AgentWebhookError, AgentWebhookProvisioner, ProvisionAgentWebhookRequest,
};
use macro_user_id::user_id::MacroUserIdStr;
use webhook::domain::models::{CreateWebhookRequest, WebhookFilter, WebhookScope};
use webhook::domain::ports::{WebhookError, WebhookService};

/// [`AgentWebhookProvisioner`] backed by a [`WebhookService`].
#[derive(Clone)]
pub struct WebhookServiceAgentWebhookProvisioner<W> {
    webhooks: W,
}

impl<W> WebhookServiceAgentWebhookProvisioner<W> {
    /// Create a provisioner over a webhook management service.
    pub fn new(webhooks: W) -> Self {
        Self { webhooks }
    }
}

fn workspace_for_owner(owner: &BotOwner) -> String {
    match owner {
        BotOwner::User { user_id } => user_id.clone(),
        BotOwner::Team { team_id } => team_id.to_string(),
    }
}

fn map_webhook_error(error: WebhookError) -> AgentWebhookError {
    match error {
        WebhookError::BadRequest(message) => AgentWebhookError::InvalidEndpoint(message),
        other => AgentWebhookError::Other(anyhow::anyhow!(other)),
    }
}

impl<W> AgentWebhookProvisioner for WebhookServiceAgentWebhookProvisioner<W>
where
    W: WebhookService,
{
    #[tracing::instrument(skip(self, req), fields(bot_id = %req.bot_id), err)]
    async fn provision(
        &self,
        caller: MacroUserIdStr<'static>,
        req: ProvisionAgentWebhookRequest,
    ) -> Result<AgentWebhook, AgentWebhookError> {
        let scope = match &req.owner {
            BotOwner::User { .. } => WebhookScope::User,
            BotOwner::Team { .. } => WebhookScope::Team,
        };
        let webhook = self
            .webhooks
            .create_webhook(
                caller.clone(),
                CreateWebhookRequest {
                    scope,
                    name: req.bot_name,
                    endpoint_url: req.endpoint_url,
                    headers: None,
                    filters: vec![WebhookFilter {
                        events: vec![BotEventKind::ChannelBotMentioned.as_str().to_string()],
                        ids: Some(vec![req.bot_id.to_string()]),
                    }],
                },
            )
            .await
            .map_err(map_webhook_error)?;

        // Derived bot-mentioned events match webhooks in the bot owner's
        // workspace. The webhook service resolves team scope from the caller's
        // team, which can differ from the bot's team for multi-team callers —
        // reject the mismatch instead of provisioning a webhook that would
        // never receive a delivery.
        let expected_workspace = workspace_for_owner(&req.owner);
        if webhook.workspace_id != expected_workspace {
            let _ = self
                .webhooks
                .delete_webhook(caller, webhook.id.clone())
                .await
                .inspect_err(|error| {
                    tracing::error!(
                        error=?error,
                        webhook_id = %webhook.id,
                        "failed to delete mismatched agent webhook"
                    );
                });
            return Err(AgentWebhookError::InvalidEndpoint(
                "the bot's owner does not match your webhook workspace".to_string(),
            ));
        }

        // Deliveries only flow to validated webhooks: attempt a validation
        // delivery now, best-effort. A failure is reported through `is_valid`
        // and the webhook can be re-validated later.
        let is_valid = match self
            .webhooks
            .validate_webhook(caller, webhook.id.clone())
            .await
        {
            Ok(result) => result.is_valid,
            Err(error) => {
                tracing::warn!(
                    error=?error,
                    webhook_id = %webhook.id,
                    "failed to validate agent webhook at creation"
                );
                false
            }
        };

        Ok(AgentWebhook {
            webhook_id: webhook.id,
            endpoint_url: webhook.endpoint_url,
            signing_secret: webhook.signing_secret,
            is_valid,
        })
    }

    #[tracing::instrument(skip(self), err)]
    async fn remove(
        &self,
        caller: MacroUserIdStr<'static>,
        webhook_id: String,
    ) -> Result<(), AgentWebhookError> {
        self.webhooks
            .delete_webhook(caller, webhook_id)
            .await
            .map_err(map_webhook_error)
    }
}
