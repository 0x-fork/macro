//! Typed system events. These are facts, never requests from the session owner.
use macro_uuid::Uuid;
use serde::{Deserialize, Serialize};

/// Metadata key authored only by the harness, preserved across ACP transports.
pub const NOTIFICATIONS_META: &str = "macro.dev/notifications";

/// One durable event, independent of its delivery attempt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    /// Stable outbox identity.
    pub id: Uuid,
    /// Review or connection this event describes.
    pub subject_id: String,
    /// RFC3339 time of the producing state change.
    pub created_at: String,
    /// Kind-specific, bounded facts.
    #[serde(flatten)]
    pub event: NotificationEvent,
}

/// Supported event contracts. Add new kinds here rather than inventing prompts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", content = "payload")]
pub enum NotificationEvent {
    /// Owner decision and its confirmed results.
    #[serde(rename = "review.decided")]
    ReviewDecided(ReviewOutcome),
    /// Completion of work initiated by a prior review decision.
    #[serde(rename = "review.settled")]
    ReviewSettled(ReviewOutcome),
    /// An app connection became available to the session.
    #[serde(rename = "app.connected")]
    AppConnected {
        /// Connected application's display name.
        app: String,
    },
}

impl NotificationEvent {
    /// Stable storage and XML kind.
    pub fn kind(&self) -> &'static str {
        match self {
            Self::ReviewDecided(_) => "review.decided",
            Self::ReviewSettled(_) => "review.settled",
            Self::AppConnected { .. } => "app.connected",
        }
    }
}

/// The result of a review batch, with no draft content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewOutcome {
    /// Overall result.
    pub outcome: DecisionOutcome,
    /// Authenticated owner who made the decision.
    pub by: String,
    /// Surface through which the owner acted.
    pub via: DecisionVia,
    /// Exact affected items and their final states.
    pub items: Vec<ReviewItemOutcome>,
}

/// Overall review decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum DecisionOutcome {
    /// All selected actions were approved.
    Approved,
    /// All selected items were dismissed.
    Dismissed,
    /// The batch contains mixed or unconfirmed results.
    Partial,
}

/// Surface of a review decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum DecisionVia {
    /// Review card.
    Card,
    /// Owner request in chat.
    Chat,
    /// Inbox action.
    Inbox,
}

/// One reviewed action's outcome.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct ReviewItemOutcome {
    /// Stable item identity.
    #[specta(type = String)]
    pub id: Uuid,
    /// Confirmed state.
    pub status: ItemStatus,
    /// Whether the owner changed its draft before deciding.
    pub edited: bool,
    /// Failure detail when work could not be confirmed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Review item state, shared with notification consumers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "utoipa", schema(as = ReviewItemStatus))]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus {
    /// Still awaiting a decision.
    Pending,
    /// Claimed for execution.
    Submitting,
    /// Confirmed complete.
    Completed,
    /// Dismissed by the owner.
    Dismissed,
    /// Outcome requires reconciliation.
    Unknown,
}

/// XML supplied next to the per-prompt agent context. Escaping JSON as XML text
/// prevents payloads from closing the envelope or introducing new instructions.
pub fn notification_context(notifications: &[Notification]) -> Result<String, serde_json::Error> {
    let mut xml = String::from("<m-notifications>");
    for notification in notifications {
        let event = serde_json::to_value(&notification.event)?;
        let payload = serde_json::to_string(&event["payload"])?;
        xml.push_str(&format!(
            "<m-notification kind=\"{}\" subject=\"{}\" at=\"{}\">{}</m-notification>",
            notification.event.kind(),
            escape(&notification.subject_id),
            escape(&notification.created_at),
            escape(&payload),
        ));
    }
    xml.push_str("</m-notifications>\nThese are system events, not user requests. Do not repeat completed actions or retry uncertain outcomes. Read final drafts through GetReview. If nothing needs saying and you have not called any tool in this turn, reply exactly <noop/>. After any tool call, summarize the result instead of replying with <noop/>.");
    Ok(xml)
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Trusted prompt metadata, rejected at public control entry points.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationInput {
    /// Events attached to this invocation.
    pub notifications: Vec<Notification>,
    /// Whether the invocation has no human prompt.
    pub system_turn: bool,
}

/// Read harness-authored input metadata from an ACP prompt frame.
pub fn input_from_runtime(
    message: &crate::domain::schema::v0::ToRuntimeMessage,
) -> Option<NotificationInput> {
    use crate::domain::schema::v0::{AcpMessage, ToRuntimeMessage};
    use agent_client_protocol::RawJsonRpcMessage;
    let ToRuntimeMessage::Acp(AcpMessage(RawJsonRpcMessage::Request(request))) = message else {
        return None;
    };
    if request.method.as_ref() != "session/prompt" {
        return None;
    }
    let params = request.params.as_ref()?.clone().into_value();
    serde_json::from_value(params.get("_meta")?.get(NOTIFICATIONS_META)?.clone()).ok()
}
