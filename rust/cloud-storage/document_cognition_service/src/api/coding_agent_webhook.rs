//! Inbound status webhook for cloud coding agents.
//!
//! Providers (Cursor today) POST status-change events here when a spawned agent
//! reaches a terminal state. This route is mounted OUTSIDE the auth middleware;
//! authenticity comes from the provider's body signature plus the signed
//! routing token in the URL — both verified inside
//! [`coding_agent::inbound::webhook::process_webhook`]. The routing token also
//! tells us which user (and chat) to deliver the update to, so no server-side
//! `agent → owner` mapping is needed.

use std::collections::HashMap;
use std::sync::Arc;

use ai_tools::ToolServiceContext;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use coding_agent::domain::models::{CodingAgentError, RoutedCodingAgentEvent};
use coding_agent::domain::ports::CodingAgentEventSink;
use coding_agent::inbound::webhook::process_webhook;
use model_entity::EntityType;
use notification::outbound::websocket::ConnectionGatewayClient;

use crate::api::context::ApiContext;

/// Realtime message type emitted to clients on a coding-agent status change.
const MESSAGE_TYPE: &str = "coding_agent_status";

/// Router for the coding-agent status webhook. Mounted at
/// `/webhooks/coding-agent/{token}` outside the auth middleware. The operator
/// configures `CODING_AGENT_WEBHOOK_URL` to point at this path; the spawn tool
/// appends the per-agent routing token.
pub fn router(state: ApiContext) -> Router {
    Router::<ApiContext>::new()
        .route("/webhooks/coding-agent/{token}", post(handle))
        .with_state(state)
}

async fn handle(
    State(tool_service_context): State<ToolServiceContext>,
    State(connection_gateway_client): State<Arc<ConnectionGatewayClient>>,
    Path(token): Path<String>,
    headers: HeaderMap,
    body: String,
) -> StatusCode {
    let coding = &tool_service_context.coding_agent_tool_context;
    let Some(settings) = coding.webhook.as_ref() else {
        tracing::warn!("received coding agent webhook but webhooks are not configured");
        return StatusCode::SERVICE_UNAVAILABLE;
    };

    let sink = ConnectionGatewaySink {
        gateway: connection_gateway_client,
    };
    let header_map: HashMap<String, String> = headers
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.as_str().to_owned(), value.to_owned()))
        })
        .collect();

    match process_webhook(
        coding.provider.as_ref(),
        &settings.secret,
        &sink,
        &header_map,
        &token,
        body.as_bytes(),
    )
    .await
    {
        Ok(()) => StatusCode::OK,
        Err(CodingAgentError::WebhookVerification(reason)) => {
            tracing::warn!(%reason, "rejected coding agent webhook");
            StatusCode::UNAUTHORIZED
        }
        Err(error) => {
            tracing::error!(error = ?error, "failed to process coding agent webhook");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

/// Delivers a verified status event to the spawning user (and chat, when known)
/// over the realtime connection gateway.
struct ConnectionGatewaySink {
    gateway: Arc<ConnectionGatewayClient>,
}

#[async_trait::async_trait]
impl CodingAgentEventSink for ConnectionGatewaySink {
    async fn deliver(&self, routed: RoutedCodingAgentEvent) -> Result<(), CodingAgentError> {
        let payload = serde_json::json!({
            "type": MESSAGE_TYPE,
            "agentId": routed.event.id.as_str(),
            "status": routed.event.status.as_str(),
            "summary": routed.event.summary,
            "prUrl": routed.event.pr_url,
            "webUrl": routed.event.web_url,
            "chatId": routed.route.chat_id,
        });

        let mut entities = vec![EntityType::User.with_entity_str(&routed.route.user_id)];
        if let Some(chat_id) = routed.route.chat_id.as_deref() {
            entities.push(EntityType::Chat.with_entity_str(chat_id));
        }

        self.gateway
            .batch_send_to_entities(MESSAGE_TYPE, &payload, entities)
            .await
            .map_err(|error| CodingAgentError::Transport(error.to_string()))?;
        Ok(())
    }
}
