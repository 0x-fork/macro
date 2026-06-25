//! HTTP endpoint for resolving a suspended chat's pending tool permissions.
//!
//! A chat suspends when the agent loop hits a tool that requires permission
//! (see [`agent::permissions`]): the gated tool call is persisted with no
//! matching result, so the saved message chain derives as
//! [`agent::MessageChainState::Suspended`]. This endpoint applies the user's
//! accept / deny / cancel decisions to that chain via
//! [`agent::transition_suspended`], persists the resolved parts, and — if the
//! chain becomes [`agent::MessageChainState::Ready`] and the event was not a
//! cancel — re-enters [`stream_and_save_message`] to resume the loop.
//!
//! It mirrors `send_chat_message`: the response is the same
//! `{ stream_id, message_id, chat_id }` and resumption reuses the exact same
//! streaming path, so resuming after a permission grant is indistinguishable
//! from a normal turn.

use super::chat_message::{BearerToken, stream_and_save_message};
use super::util::chat_permissions;
use crate::api::context::ApiContext;
use crate::service::ai_stream_registry::CancellationSubscription;
use crate::service::get_chat::get_chat;
use agent::types::{AssistantMessagePart, ChatMessage, ChatMessageContent, Role};
use agent::{AcceptResult, MessageChainState, ResolutionEvent, ToolDecision, transition_suspended};
use axum::Json;
use axum::extract::{Extension, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use chat::domain::ports::MessageService;
use chat::inbound::http::extractors::ChatModelAccess;
use macro_user_id::user_id::MacroUserIdStr;
use mcp_client::domain::ports::McpServerStore;
use model::user::UserContext;
use model_entity::{Entity, EntityType};
use models_permissions::share_permission::access_level::AccessLevel;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use stream::domain::StreamId;
use utoipa::ToSchema;

/// A single per-tool decision in a resolution request.
#[derive(Debug, Serialize, Deserialize, ToSchema, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ToolResolution {
    /// Run the tool. Execution happens server-side through the toolset.
    Accept {
        /// The id of the tool call being accepted.
        call_id: String,
    },
    /// Reject the tool; the model sees a "denied" result.
    Deny {
        /// The id of the tool call being denied.
        call_id: String,
    },
}

/// The resolution action: a batch of per-call accept/deny, or a cancel-all.
#[derive(Debug, Serialize, Deserialize, ToSchema, Clone)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ResolveAction {
    /// Apply per-call decisions. May cover only some pending calls (partial),
    /// in which case the chat stays suspended on the remainder.
    Resolve {
        /// The per-call decisions.
        decisions: Vec<ToolResolution>,
    },
    /// Cancel: resolve all pending calls as cancelled. Never resumes the loop.
    Cancel,
}

/// HTTP request to resolve a suspended chat's pending tool permissions.
#[derive(Debug, Serialize, Deserialize, ToSchema, Clone)]
pub struct ResolveChatRequest {
    /// The chat whose pending tool calls are being resolved.
    pub chat_id: String,
    /// The model to resume streaming with (`provider/model` id).
    pub model: String,
    /// Which toolset to use when executing accepted tools / resuming.
    #[serde(default)]
    pub toolset: crate::model::stream::ToolSet,
    /// The resolution action.
    #[serde(flatten)]
    pub action: ResolveAction,
}

/// Response for a resolution request.
///
/// The suspended assistant message and its resumption are ONE message,
/// identified by `message_id` (= the suspended message's id) in every case —
/// resume, partial resolve, and cancel. `parts` is the resolved suspended-message
/// parts (`outcome.parts`): the frontend patches that message in place with
/// them. On a resume, `stream_id` (also = the suspended message's id) carries the
/// continuation, which rebuilds the same message live.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ResolveChatResponse {
    /// The stream that will carry the resumed response (empty when not resumed).
    pub stream_id: String,
    /// The id of the (single) assistant message — the suspended message's id in
    /// every case, so the frontend can patch / rebuild it in place.
    pub message_id: String,
    /// The chat id.
    pub chat_id: String,
    /// Whether the loop resumed streaming.
    pub resumed: bool,
    /// The resolved parts of the suspended message (tool call(s) + their
    /// spliced results). The frontend replaces the suspended message's parts
    /// with these.
    pub parts: Vec<AssistantMessagePart>,
}

/// Error response for the resolve endpoint.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ResolveChatError {
    /// Human-readable error.
    pub error: String,
    #[serde(skip)]
    status: Option<StatusCode>,
}

impl ResolveChatError {
    fn bad(msg: impl Into<String>) -> Self {
        Self {
            error: msg.into(),
            status: Some(StatusCode::BAD_REQUEST),
        }
    }
    fn forbidden(msg: impl Into<String>) -> Self {
        Self {
            error: msg.into(),
            status: Some(StatusCode::FORBIDDEN),
        }
    }
    fn internal(msg: impl Into<String>) -> Self {
        Self {
            error: msg.into(),
            status: Some(StatusCode::INTERNAL_SERVER_ERROR),
        }
    }
}

impl std::fmt::Display for ResolveChatError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.error)
    }
}

impl IntoResponse for ResolveChatError {
    fn into_response(self) -> axum::response::Response {
        let status = self.status.unwrap_or(StatusCode::BAD_REQUEST);
        (status, Json(self)).into_response()
    }
}

/// Resolve a suspended chat's pending tool calls and, if it becomes ready,
/// resume streaming.
#[utoipa::path(
    post,
    path = "/stream/chat/resolve",
    request_body = ResolveChatRequest,
    responses(
        (status = 200, description = "Resolution applied", body = ResolveChatResponse),
        (status = 400, description = "Bad request", body = ResolveChatError),
        (status = 403, description = "Forbidden", body = ResolveChatError),
    )
)]
#[tracing::instrument(skip(state, model_access, user_context, bearer, request), fields(chat_id = %request.chat_id, user_id = %user_context.user_id), ret, err)]
pub async fn resolve_chat_tool_calls(
    State(state): State<ApiContext>,
    model_access: ChatModelAccess,
    Extension(user_context): Extension<UserContext>,
    Extension(bearer): Extension<BearerToken>,
    Json(request): Json<ResolveChatRequest>,
) -> Result<Json<ResolveChatResponse>, ResolveChatError> {
    Box::pin(resolve_inner(
        state,
        model_access,
        user_context,
        bearer,
        request,
    ))
    .await
}

async fn resolve_inner(
    state: ApiContext,
    model_access: ChatModelAccess,
    user_context: UserContext,
    bearer: BearerToken,
    request: ResolveChatRequest,
) -> Result<Json<ResolveChatResponse>, ResolveChatError> {
    let ctx = Arc::new(state);
    let jwt_token = bearer.0;

    if !model_access.has_access(&request.model) {
        return Err(ResolveChatError::forbidden(format!(
            "No access to model {}",
            request.model
        )));
    }

    let user_id = MacroUserIdStr::try_from(user_context.user_id.clone())
        .map_err(|_| ResolveChatError::bad("Invalid user ID"))?;

    // Load the chat and enforce edit permission (same gate as sending).
    let chat = get_chat(&ctx, &request.chat_id, user_id.0.as_ref())
        .await
        .map_err(|_| ResolveChatError::bad("Chat not found"))?;
    match chat_permissions::chat_access(
        &ctx,
        &user_context,
        &request.chat_id,
        request.chat_id.clone(),
    )
    .await
    .map_err(|e| ResolveChatError::internal(format!("Permission check failed: {e:?}")))?
    {
        AccessLevel::View | AccessLevel::Comment => {
            return Err(ResolveChatError::forbidden(
                "Insufficient permissions to resolve tool calls",
            ));
        }
        _ => {}
    }

    // Find the suspended assistant message: the last assistant message whose
    // parts contain a dangling tool call.
    let Some(suspended) = chat
        .messages
        .iter()
        .rev()
        .find(|m| matches!(m.content, ChatMessageContent::AssistantMessageParts(_)))
    else {
        return Err(ResolveChatError::bad("Chat has no assistant tool calls"));
    };
    let suspended_message_id = suspended.id.clone();
    let ChatMessageContent::AssistantMessageParts(parts) = suspended.content.clone() else {
        return Err(ResolveChatError::bad("Chat has no assistant tool calls"));
    };

    if !agent::derive_state(&parts).is_suspended() {
        return Err(ResolveChatError::bad(
            "Chat is not awaiting tool permission",
        ));
    }

    // Build the toolset + tool context used to execute accepted tools. This
    // mirrors `stream_and_save_message`'s construction so accepted tools run
    // through the exact same dispatch path.
    let mcp_records = ctx
        .mcp_state
        .store()
        .list(&user_id)
        .await
        .unwrap_or_default();
    let toolset =
        mcp_client::domain::service::CombinedToolSet::new(ctx.all_tools.clone(), &mcp_records)
            .await;
    let mut tool_context = ctx.tool_service_context.clone();
    let usage_ctx = ai_usage::UsageContext::new(ai_usage::AiFeature::Chat, user_id.clone())
        .with_entity(macro_uuid::string_to_uuid(&request.chat_id).ok());
    tool_context.usage_context = usage_ctx;

    // Translate the request action into an agent ResolutionEvent, executing
    // accepted tools server-side so their results splice into the chain.
    let event = match &request.action {
        ResolveAction::Cancel => ResolutionEvent::Cancel,
        ResolveAction::Resolve { decisions } => {
            let mut tool_decisions = Vec::with_capacity(decisions.len());
            for decision in decisions {
                match decision {
                    ToolResolution::Deny { call_id } => {
                        tool_decisions.push(ToolDecision::Deny {
                            call_id: call_id.clone(),
                        });
                    }
                    ToolResolution::Accept { call_id } => {
                        let result = execute_accepted_call(
                            &toolset,
                            &tool_context,
                            &user_id,
                            &parts,
                            call_id,
                        )
                        .await;
                        tool_decisions.push(ToolDecision::Accept {
                            call_id: call_id.clone(),
                            result,
                        });
                    }
                }
            }
            ResolutionEvent::Batch(tool_decisions)
        }
    };

    let outcome = transition_suspended(parts, event);

    // If the chain is still suspended (partial resolve) or this was a cancel,
    // we're done — no new stream. Persist the resolved parts onto the suspended
    // message in place and return them so the frontend can patch the message.
    if !outcome.resume {
        ctx.message_service
            .update(
                &user_id,
                &request.chat_id,
                &suspended_message_id,
                &ChatMessageContent::AssistantMessageParts(outcome.parts.clone()),
            )
            .await
            .map_err(|e| {
                ResolveChatError::internal(format!("Failed to persist resolution: {e}"))
            })?;

        tracing::info!(
            chat_id = %request.chat_id,
            suspended = outcome.state.is_suspended(),
            "resolution applied without resuming"
        );
        return Ok(Json(ResolveChatResponse {
            stream_id: String::new(),
            // The suspended message's id — the frontend patches it in place.
            message_id: suspended_message_id,
            chat_id: request.chat_id,
            resumed: false,
            parts: outcome.parts,
        }));
    }

    debug_assert!(matches!(outcome.state, MessageChainState::Ready));

    // Resume: the suspended message and its continuation are ONE message, so the
    // continuation persists onto (and the frontend merges into) the SAME
    // `message_id = suspended_message_id`. The stream id, however, must be a
    // FRESH uuid: the original suspended turn already registered (and finished)
    // a stream under `suspended_message_id`, and the client's stream registry
    // keys by `(entity_id, stream_id)` — reusing it would hand the client the
    // old, done stream instead of the live continuation. So message_id and
    // stream_id are deliberately different here.
    let message_id = suspended_message_id.clone();
    let stream_id = uuid::Uuid::new_v4().to_string();

    let resolved_parts = outcome.parts.clone();
    let rig_request = rebuild_chain(&chat, &suspended_message_id, outcome.parts);

    let durable_stream_id = StreamId {
        entity_type: EntityType::Chat,
        entity_id: request.chat_id.clone(),
        stream_id: stream_id.clone(),
    };
    let cancellation_sub: CancellationSubscription =
        ctx.ai_stream_registry.register(stream_id.clone()).await;

    // No additional user content on resume — we continue from the resolved
    // tool results. Use the same prompt the original turn selected so a resumed
    // continuation sees the same tools selection.
    let system_prompt = super::util::chat_message::toolset::tools_prompt_for(
        &request.toolset,
        &*ctx.all_tools_prompt,
    )
    .to_string();

    stream_and_save_message(
        ctx.clone(),
        rig_request,
        system_prompt,
        user_id.clone(),
        jwt_token,
        request.chat_id.clone(),
        message_id.clone(),
        stream_id.clone(),
        request.model.clone(),
        std::time::Instant::now(),
        String::new(),
        String::new(),
        Vec::<Entity<'static>>::new(),
        durable_stream_id,
        cancellation_sub,
        // Re-emit + seed the resolved parts so the continuation persists and
        // renders as ONE message: tool call(s) → results → continuation.
        resolved_parts.clone(),
    );

    Ok(Json(ResolveChatResponse {
        stream_id,
        message_id,
        chat_id: request.chat_id,
        resumed: true,
        parts: resolved_parts,
    }))
}

/// Execute an accepted tool call by id against the toolset, returning the
/// result to splice into the chain.
///
/// A user tool returns its `PendingUserExecution` placeholder here (it *is* a
/// tool response, so the chain leaves suspended; the user-execution button flow
/// then takes over). An unknown call id or dispatch error becomes an
/// [`AcceptResult::Err`].
async fn execute_accepted_call<TS>(
    toolset: &TS,
    tool_context: &ai_tools::ToolServiceContext,
    user_id: &MacroUserIdStr<'static>,
    parts: &[AssistantMessagePart],
    call_id: &str,
) -> AcceptResult
where
    TS: ai_toolset::ToolSet<ai_tools::ToolServiceContext>,
{
    let Some((name, json)) = parts.iter().find_map(|p| match p {
        AssistantMessagePart::ToolCall { id, name, json, .. }
        | AssistantMessagePart::McpToolCall { id, name, json, .. }
            if id == call_id =>
        {
            Some((name.clone(), json.clone()))
        }
        _ => None,
    }) else {
        return AcceptResult::Err("unknown tool call".to_string());
    };

    let request_context = ai_toolset::RequestContext::new(user_id.clone());
    match toolset
        .try_tool_call(tool_context.clone(), request_context, &name, &json)
        .await
    {
        Ok(Ok(value)) => AcceptResult::Json(value),
        Ok(Err(e)) => {
            tracing::error!(error = ?e.internal_error, tool = %name, "accepted tool call failed");
            AcceptResult::Err(e.description)
        }
        Err(e) => {
            tracing::error!(error = ?e, tool = %name, "accepted tool dispatch failed");
            AcceptResult::Err(e.to_string())
        }
    }
}

/// Reconstruct the full message chain for resumption, substituting the resolved
/// parts for the previously-suspended assistant message.
fn rebuild_chain(
    chat: &crate::model::chats::ChatResponse,
    suspended_message_id: &str,
    resolved_parts: Vec<AssistantMessagePart>,
) -> Vec<ChatMessage> {
    chat.messages
        .iter()
        .map(|m| {
            let content = if m.id == suspended_message_id {
                ChatMessageContent::AssistantMessageParts(resolved_parts.clone())
            } else {
                m.content.clone()
            };
            ChatMessage {
                role: m.role,
                content,
                attachments: None,
            }
        })
        .filter(|m| {
            // Drop empty system placeholders that would confuse the provider.
            !(m.role == Role::System && m.content.message_text().is_empty())
        })
        .collect()
}

#[cfg(test)]
mod test;
