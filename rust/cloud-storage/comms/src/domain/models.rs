use item_filters::ast::{LiteralTree, channel::ChannelLiteral};
use macro_user_id::user_id::MacroUserIdStr;
pub use models_comms::*;
use models_pagination::{Query, SimpleSortMethod};
use serde::Deserialize;
use uuid::Uuid;

pub mod channel_name;

/// The tier of a bot integration, determining how it receives webhook payloads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IntegrationTier {
    /// Dedicated endpoint that parses the service's native payload format.
    Native,
    /// Uses the generic endpoint, but with suggested payload templates.
    TemplateGuided,
    /// Uses the generic endpoint with a simple `{ "text": "..." }` contract.
    Generic,
}

/// A bot integration type that can be used to create channel bots.
#[derive(Debug, Clone)]
pub struct BotIntegration {
    /// Unique identifier.
    pub id: uuid::Uuid,
    /// Short key used for routing (e.g. "github", "datadog", "generic").
    pub key: String,
    /// Human-readable display name.
    pub name: String,
    /// URL or path to the integration's icon.
    pub icon_url: Option<String>,
    /// Integration tier.
    pub tier: IntegrationTier,
    /// Suggested payload template for template-guided integrations.
    pub payload_template: Option<String>,
    /// Markdown setup instructions shown during bot creation.
    pub setup_instructions: Option<String>,
}

/// Errors from bot operations.
#[derive(Debug, thiserror::Error)]
pub enum BotError {
    /// Validation failure (bad input).
    #[error("{0}")]
    Validation(String),
    /// Something went wrong internally.
    #[error("internal error: {0}")]
    Internal(rootcause::Report),
}

/// Parameters for creating a new channel bot.
#[derive(Debug)]
pub struct CreateBotRequest {
    /// The integration type (FK to comms_webhook_integrations).
    pub integration_id: Uuid,
    /// Display name for the bot in messages.
    pub name: String,
}

/// The result of creating a bot.
#[derive(Debug)]
pub struct CreatedBot {
    /// The generated bot ID.
    pub id: Uuid,
    /// The webhook authentication token (only returned once at creation).
    pub token: String,
    /// The integration key (e.g. "github", "generic") for building the webhook URL.
    pub integration_key: String,
}

pub struct ChannelPreviewsRequest<'a> {
    pub channel_ids: &'a [Uuid],
    pub user: MacroUserIdStr<'a>,
    pub organization_id: Option<channel::OrganizationId>,
}

#[derive(Debug, Deserialize)]
pub struct UserName {
    pub id: MacroUserIdStr<'static>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

impl UserName {
    /// attempt to create the "pretty" name for this user
    /// this can return None if the first name and last name dont exist
    /// or if they are set to "N/A" which is apparrently something that can happen
    pub fn display_name(&self) -> Option<String> {
        const NA: &str = "N/A";
        match (
            self.first_name.as_deref().filter(|v| *v != NA),
            self.last_name.as_deref().filter(|v| *v != NA),
        ) {
            (None, None) => None,
            (None, Some(last)) => Some(last.to_string()),
            (Some(first), None) => Some(first.to_string()),
            (Some(first), Some(last)) => Some(format!("{first} {last}")),
        }
    }
}

#[derive(Debug)]
pub struct GetChannelsRequest {
    pub macro_id: MacroUserIdStr<'static>,
    pub limit: Option<u32>,
    pub query: Query<Uuid, SimpleSortMethod, LiteralTree<ChannelLiteral>>,
}

impl GetChannelsRequest {
    pub fn into_params(self) -> GetChannelsParams {
        GetChannelsParams {
            macro_id: self.macro_id,
            limit: self.limit,
            query: self.query,
        }
    }
}

#[derive(Debug)]
pub struct GetChannelsParams {
    macro_id: MacroUserIdStr<'static>,
    limit: Option<u32>,
    query: Query<Uuid, SimpleSortMethod, LiteralTree<ChannelLiteral>>,
}

impl GetChannelsParams {
    pub fn user(&self) -> &MacroUserIdStr<'static> {
        &self.macro_id
    }

    pub fn limit(&self) -> Option<u32> {
        self.limit
    }

    pub fn query(&self) -> &Query<Uuid, SimpleSortMethod, LiteralTree<ChannelLiteral>> {
        &self.query
    }
}
