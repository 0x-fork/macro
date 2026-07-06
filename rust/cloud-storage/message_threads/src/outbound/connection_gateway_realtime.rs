//! Connection-gateway realtime publisher for thread events.
//!
//! Mirrors `channels::outbound::connection_gateway_realtime`, but publishes
//! parent-tagged `thread_message` / `thread_reaction` events. New event names
//! keep existing channel clients untouched; the frontend `SyncProvider` routes
//! these to the discussion caches keyed by `(parent_type, parent_id)`.

use std::sync::Arc;

use connection_gateway_client::ConnectionGatewayClient;
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::EntityType as GatewayEntityType;
use serde::Serialize;

use crate::domain::models::{ThreadMessageRealtime, ThreadReactionRealtime};
use crate::domain::ports::ThreadRealtimePublisher;

/// Connection-gateway backed [`ThreadRealtimePublisher`].
#[derive(Clone)]
pub struct ConnectionGatewayThreadRealtimePublisher {
    client: Arc<ConnectionGatewayClient>,
}

impl ConnectionGatewayThreadRealtimePublisher {
    /// Create a publisher over a shared gateway client.
    pub fn new(client: Arc<ConnectionGatewayClient>) -> Self {
        Self { client }
    }

    async fn send<T: Serialize + Send>(
        &self,
        message_type: &'static str,
        payload: T,
        recipients: Vec<MacroUserIdStr<'static>>,
    ) -> anyhow::Result<()> {
        if recipients.is_empty() {
            return Ok(());
        }
        self.client
            .batch_send_message(
                message_type.to_string(),
                serde_json::to_value(payload)?,
                recipients
                    .iter()
                    .map(|r| GatewayEntityType::User.with_entity_str(r.as_ref()))
                    .collect(),
            )
            .await?;
        Ok(())
    }
}

impl ThreadRealtimePublisher for ConnectionGatewayThreadRealtimePublisher {
    async fn publish_message(
        &self,
        recipients: Vec<MacroUserIdStr<'static>>,
        event: ThreadMessageRealtime,
    ) -> Result<(), anyhow::Error> {
        self.send("thread_message", event, recipients).await
    }

    async fn publish_reaction(
        &self,
        recipients: Vec<MacroUserIdStr<'static>>,
        event: ThreadReactionRealtime,
    ) -> Result<(), anyhow::Error> {
        self.send("thread_reaction", event, recipients).await
    }
}
