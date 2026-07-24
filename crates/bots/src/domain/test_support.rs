//! Test doubles shared across the crate's test modules.

use std::sync::{Arc, Mutex};

use macro_user_id::user_id::MacroUserIdStr;

use super::models::AgentWebhook;
use super::ports::{AgentWebhookError, AgentWebhookProvisioner, ProvisionAgentWebhookRequest};

/// [`AgentWebhookProvisioner`] fake that records calls and returns canned
/// webhooks. Configure `fail_provision` to exercise provisioning failures.
#[derive(Clone, Default)]
pub(crate) struct FakeAgentWebhookProvisioner {
    /// Requests passed to [`AgentWebhookProvisioner::provision`].
    pub provisioned: Arc<Mutex<Vec<ProvisionAgentWebhookRequest>>>,
    /// Webhook ids passed to [`AgentWebhookProvisioner::remove`].
    pub removed: Arc<Mutex<Vec<String>>>,
    /// When set, `provision` fails with an invalid-endpoint error.
    pub fail_provision: bool,
}

/// Webhook id every successful fake provisioning returns.
pub(crate) const FAKE_AGENT_WEBHOOK_ID: &str = "wh_agent-test";

impl FakeAgentWebhookProvisioner {
    /// A provisioner that rejects every endpoint.
    pub fn failing() -> Self {
        Self {
            fail_provision: true,
            ..Self::default()
        }
    }
}

impl AgentWebhookProvisioner for FakeAgentWebhookProvisioner {
    async fn provision(
        &self,
        _caller: MacroUserIdStr<'static>,
        req: ProvisionAgentWebhookRequest,
    ) -> Result<AgentWebhook, AgentWebhookError> {
        if self.fail_provision {
            return Err(AgentWebhookError::InvalidEndpoint(
                "intentionally rejected endpoint".to_string(),
            ));
        }
        let webhook = AgentWebhook {
            webhook_id: FAKE_AGENT_WEBHOOK_ID.to_string(),
            endpoint_url: req.endpoint_url.clone(),
            signing_secret: "whsec_test".to_string(),
            is_valid: true,
        };
        self.provisioned.lock().unwrap().push(req);
        Ok(webhook)
    }

    async fn remove(
        &self,
        _caller: MacroUserIdStr<'static>,
        webhook_id: String,
    ) -> Result<(), AgentWebhookError> {
        self.removed.lock().unwrap().push(webhook_id);
        Ok(())
    }
}
