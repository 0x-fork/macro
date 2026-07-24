//! Bot domain models.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Shared bot id used by bot principals.
pub use bot_id::BotId;

/// Bot kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum BotKind {
    /// User- or team-owned bot.
    Owned,
    /// First-party system bot.
    System,
}

impl BotKind {
    /// Storage representation.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Owned => "owned",
            Self::System => "system",
        }
    }
}

impl std::str::FromStr for BotKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "owned" => Ok(Self::Owned),
            "system" => Ok(Self::System),
            other => Err(format!("unknown bot kind: {other}")),
        }
    }
}

/// Bot type: how the bot is driven.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum BotType {
    /// Registry bot driven by inbound webhook calls.
    Standard,
    /// Agent bot triggered by events.
    Agent,
}

impl BotType {
    /// Storage representation.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Standard => "standard",
            Self::Agent => "agent",
        }
    }
}

impl std::str::FromStr for BotType {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "standard" => Ok(Self::Standard),
            "agent" => Ok(Self::Agent),
            other => Err(format!("unknown bot type: {other}")),
        }
    }
}

/// How an agent bot reacts to its subscribed events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum AgentMode {
    /// Handled in-process by the internal Macro agent.
    Macro,
    /// Delivered to an external endpoint through a provisioned webhook.
    External,
}

impl AgentMode {
    /// Storage representation.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Macro => "macro",
            Self::External => "external",
        }
    }
}

impl std::str::FromStr for AgentMode {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "macro" => Ok(Self::Macro),
            "external" => Ok(Self::External),
            other => Err(format!("unknown agent mode: {other}")),
        }
    }
}

/// Event an agent bot can subscribe to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub enum BotEventKind {
    /// The bot was `@`-mentioned in a channel message.
    #[serde(rename = "channel.bot-mentioned")]
    ChannelBotMentioned,
}

impl BotEventKind {
    /// Storage and wire representation.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ChannelBotMentioned => "channel.bot-mentioned",
        }
    }
}

impl std::str::FromStr for BotEventKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "channel.bot-mentioned" => Ok(Self::ChannelBotMentioned),
            other => Err(format!("unknown bot event: {other}")),
        }
    }
}

/// Agent configuration for an agent bot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct AgentConfig {
    /// How the agent reacts to its subscribed events.
    pub mode: AgentMode,
    /// Events the agent is subscribed to.
    pub events: Vec<BotEventKind>,
    /// Provisioned webhook id for an external agent.
    pub webhook_id: Option<String>,
}

/// Channel type for a channel containing a bot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum BotChannelType {
    /// Public channel.
    Public,
    /// Private channel.
    Private,
    /// Direct message channel.
    DirectMessage,
    /// Team channel.
    Team,
}

impl BotChannelType {
    /// Storage representation.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Public => "public",
            Self::Private => "private",
            Self::DirectMessage => "direct_message",
            Self::Team => "team",
        }
    }
}

impl std::str::FromStr for BotChannelType {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "public" => Ok(Self::Public),
            "private" => Ok(Self::Private),
            "direct_message" => Ok(Self::DirectMessage),
            "team" => Ok(Self::Team),
            other => Err(format!("unknown bot channel type: {other}")),
        }
    }
}

/// Bot owner.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum BotOwner {
    /// User-owned bot.
    User {
        /// Owner user id.
        user_id: String,
    },
    /// Team-owned bot.
    Team {
        /// Owner team id.
        team_id: Uuid,
    },
}

/// Bot row.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct Bot {
    /// Bot id.
    pub id: BotId,
    /// Bot kind.
    pub kind: BotKind,
    /// Bot type.
    pub bot_type: BotType,
    /// Agent configuration for agent bots.
    pub agent: Option<AgentConfig>,
    /// Owner for owned bots.
    pub owner: Option<BotOwner>,
    /// Display name.
    pub name: String,
    /// Stable handle.
    pub handle: String,
    /// Optional description.
    pub description: Option<String>,
    /// Optional avatar URL.
    pub avatar_url: Option<String>,
    /// User that created this bot.
    pub created_by: Option<String>,
    /// Creation timestamp.
    pub created_at: DateTime<Utc>,
    /// Update timestamp.
    pub updated_at: DateTime<Utc>,
    /// Soft-delete timestamp.
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Channel containing a bot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct BotChannel {
    /// Channel id.
    pub channel_id: Uuid,
    /// Channel display name.
    pub name: Option<String>,
    /// Channel type.
    pub channel_type: BotChannelType,
    /// Timestamp when the bot joined the channel.
    pub joined_at: DateTime<Utc>,
}

/// Bot token metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct BotToken {
    /// Token id.
    pub id: Uuid,
    /// Owning bot id.
    pub bot_id: BotId,
    /// Raw bearer token.
    pub token: String,
    /// Optional token label.
    pub label: Option<String>,
    /// Last successful use.
    pub last_used_at: Option<DateTime<Utc>>,
    /// Expiration timestamp.
    pub expires_at: Option<DateTime<Utc>>,
    /// Revocation timestamp.
    pub revoked_at: Option<DateTime<Utc>>,
    /// Creation timestamp.
    pub created_at: DateTime<Utc>,
}

/// Authenticated bot principal.
#[derive(Debug, Clone)]
pub struct AuthenticatedBot {
    /// Bot id.
    pub bot_id: BotId,
    /// Bot kind.
    pub kind: BotKind,
}

/// Candidate token row used during bearer-token authentication.
#[derive(Debug, Clone)]
pub struct BotTokenCandidate {
    /// Token metadata.
    pub token: BotToken,
    /// Authenticated bot principal associated with the token.
    pub bot: AuthenticatedBot,
}

/// Agent configuration supplied when creating an agent bot.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct CreateAgentConfigRequest {
    /// How the agent reacts to its subscribed events.
    pub mode: AgentMode,
    /// Events the agent subscribes to. Must be non-empty.
    pub events: Vec<BotEventKind>,
    /// Endpoint URL for an external agent's webhook. Required for
    /// [`AgentMode::External`]; rejected for [`AgentMode::Macro`].
    pub webhook_url: Option<String>,
}

/// Request to create a bot.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct CreateBotRequest {
    /// Team owner. The caller must be a team administrator or owner. Omit for a user-owned bot.
    pub team_id: Option<Uuid>,
    /// Display name.
    pub name: String,
    /// Stable handle.
    pub handle: String,
    /// Optional description.
    pub description: Option<String>,
    /// Optional avatar URL.
    pub avatar_url: Option<String>,
    /// Agent configuration. Omit for a standard bot.
    pub agent: Option<CreateAgentConfigRequest>,
}

/// Webhook provisioned for an external agent bot.
///
/// The signing secret is only surfaced here, at creation time.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct AgentWebhook {
    /// Provisioned webhook id.
    pub webhook_id: String,
    /// Endpoint URL events are delivered to.
    pub endpoint_url: String,
    /// Secret used to sign deliveries to the endpoint.
    pub signing_secret: String,
    /// Whether the endpoint accepted the signed validation delivery attempted
    /// at creation. Events are only delivered to validated webhooks; an
    /// invalid webhook can be re-validated from webhook settings.
    pub is_valid: bool,
}

/// Response returned after creating a bot.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct CreateBotResponse {
    /// Created bot.
    pub bot: Bot,
    /// Webhook provisioned for an external agent, including its signing
    /// secret. Present only when the bot was created as an external agent.
    pub agent_webhook: Option<AgentWebhook>,
}

/// Request to patch a bot.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct PatchBotRequest {
    /// Display name.
    pub name: Option<String>,
    /// Stable handle.
    pub handle: Option<String>,
    /// Optional description.
    pub description: Option<String>,
    /// Optional avatar URL.
    pub avatar_url: Option<String>,
}

/// Request to create a bot token.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct CreateBotTokenRequest {
    /// Token label.
    pub label: Option<String>,
    /// Optional expiration timestamp.
    pub expires_at: Option<DateTime<Utc>>,
}

/// Request to add a bot to a channel.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct AddChannelBotRequest {
    /// Bot id.
    pub bot_id: BotId,
}

/// Request to create a bot scoped to a channel.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct CreateChannelScopedBotRequest {
    /// Team owner. The caller must be a team administrator or owner. Omit for a user-owned bot.
    pub team_id: Option<Uuid>,
    /// Display name.
    pub name: String,
    /// Stable handle.
    pub handle: String,
    /// Optional description.
    pub description: Option<String>,
    /// Optional avatar URL.
    pub avatar_url: Option<String>,
    /// Optional token label.
    pub token_label: Option<String>,
    /// Optional token expiration timestamp.
    pub token_expires_at: Option<DateTime<Utc>>,
}

/// Response containing a newly minted token.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct CreateBotTokenResponse {
    /// Token metadata.
    pub token: BotToken,
    /// Raw bearer token.
    pub bearer_token: String,
}

/// Response containing a newly created channel-scoped bot and token.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct CreateChannelScopedBotResponse {
    /// Created bot.
    pub bot: Bot,
    /// Token metadata.
    pub token: BotToken,
    /// Raw bot token.
    pub bot_token: String,
}

/// Request to post a channel webhook message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct ChannelWebhookRequest {
    /// Message body.
    pub content: String,
}

/// Response returned after posting a channel webhook message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
pub struct ChannelWebhookResponse {
    /// Created message id.
    pub message_id: String,
}
