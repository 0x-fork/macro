//! Inbound status webhook for cloud coding agents.
//!
//! Providers (Cursor, Claude) POST status events here. The route is mounted
//! OUTSIDE the auth middleware; authenticity comes from each provider's own
//! verification (body signature, and — for Cursor — the signed routing token in
//! the URL), performed inside [`coding_agent::inbound::webhook::process_webhook`].
//! The provider recovers the agent's correlation (owner user / chat), so no
//! server-side `agent → owner` mapping is needed.
//!
//! Path: `/webhooks/coding-agent/{provider}` (Claude; correlation in body) and
//! `/webhooks/coding-agent/{provider}/{token}` (Cursor; correlation in token).

use std::collections::HashMap;
use std::sync::Arc;

use ai_tools::ToolServiceContext;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use coding_agent::domain::models::{CodingAgentError, CodingAgentEvent, CodingAgentProviderKind};
use coding_agent::domain::ports::CodingAgentEventSink;
use coding_agent::inbound::webhook::process_webhook;
use model_entity::EntityType;
use notification::outbound::websocket::ConnectionGatewayClient;

use crate::api::context::ApiContext;

/// Realtime message type emitted to clients on a coding-agent status change.
const MESSAGE_TYPE: &str = "coding_agent_status";

/// Router for the coding-agent status webhook, mounted outside the auth layer.
pub fn router(state: ApiContext) -> Router {
    Router::<ApiContext>::new()
        .route("/webhooks/coding-agent/{provider}", post(handle))
        .route(
            "/webhooks/coding-agent/{provider}/{token}",
            post(handle_with_token),
        )
        .with_state(state)
}

async fn handle(
    State(tool_service_context): State<ToolServiceContext>,
    State(connection_gateway_client): State<Arc<ConnectionGatewayClient>>,
    Path(provider): Path<String>,
    headers: HeaderMap,
    body: String,
) -> StatusCode {
    process(
        &tool_service_context,
        connection_gateway_client,
        &provider,
        None,
        &headers,
        body.as_bytes(),
    )
    .await
}

async fn handle_with_token(
    State(tool_service_context): State<ToolServiceContext>,
    State(connection_gateway_client): State<Arc<ConnectionGatewayClient>>,
    Path((provider, token)): Path<(String, String)>,
    headers: HeaderMap,
    body: String,
) -> StatusCode {
    process(
        &tool_service_context,
        connection_gateway_client,
        &provider,
        Some(token.as_str()),
        &headers,
        body.as_bytes(),
    )
    .await
}

async fn process(
    tool_service_context: &ToolServiceContext,
    connection_gateway_client: Arc<ConnectionGatewayClient>,
    provider_segment: &str,
    url_token: Option<&str>,
    headers: &HeaderMap,
    body: &[u8],
) -> StatusCode {
    let Some(kind) = CodingAgentProviderKind::from_wire(provider_segment) else {
        tracing::warn!(provider = provider_segment, "unknown coding agent provider");
        return StatusCode::NOT_FOUND;
    };
    let Some(provider) = tool_service_context
        .coding_agent_tool_context
        .providers
        .get(&kind)
    else {
        tracing::warn!(
            provider = provider_segment,
            "coding agent provider not configured"
        );
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

    match process_webhook(provider.as_ref(), &sink, &header_map, url_token, body).await {
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
    async fn deliver(&self, event: CodingAgentEvent) -> Result<(), CodingAgentError> {
        let Some(correlation) = event.correlation.as_ref() else {
            tracing::warn!(
                agent_id = %event.id,
                "coding agent event has no correlation; cannot route to a user"
            );
            return Ok(());
        };

        let payload = serde_json::json!({
            "type": MESSAGE_TYPE,
            "provider": event.provider.as_str(),
            "agentId": event.id.as_str(),
            "status": event.status.as_str(),
            "summary": event.summary,
            "prUrl": event.pr_url,
            "webUrl": event.web_url,
            "chatId": correlation.chat_id,
        });

        let mut entities = vec![EntityType::User.with_entity_str(&correlation.user_id)];
        if let Some(chat_id) = correlation.chat_id.as_deref() {
            entities.push(EntityType::Chat.with_entity_str(chat_id));
        }

        self.gateway
            .batch_send_to_entities(MESSAGE_TYPE, &payload, entities)
            .await
            .map_err(|error| CodingAgentError::Transport(error.to_string()))?;
        Ok(())
    }
}
