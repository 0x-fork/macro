use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum::{Display, EnumString};
use utoipa::ToSchema;

pub mod call_record;
pub mod channel;
pub mod chat;
pub mod crm_company;
pub mod document;
pub mod email;
pub mod project;
pub mod score;
mod simple;
pub mod timestamp;
pub mod unified;

pub use simple::{
    Highlight, SearchGotoCallRecord, SearchGotoChannel, SearchGotoChat, SearchGotoContent,
    SearchGotoDocument, SearchGotoEmail, SimpleSearchResponse, SimpleSearchResponseItem,
};
pub use timestamp::{HumanReadableTimestamp, TimestampField, TimestampSeconds};
#[derive(
    Serialize, Deserialize, Debug, ToSchema, Copy, Clone, EnumString, Display, JsonSchema, Default,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum SearchOn {
    Name,
    #[default]
    Content,
    NameContent,
}

/// How to order unified search results.
///
/// `UpdatedAt` (the default) matches existing behavior: relevance scores
/// aren't comparable across the different entity-type indices (documents,
/// chats, emails, ...) merged into one unified result set, so recency is
/// the ordering already used to make a cross-type result list meaningful.
/// `Relevancy` is an opt-in alternative that orders by each hit's
/// OpenSearch match score instead, for callers that only care about best
/// match (typically when the result set is filtered to a single entity
/// type).
#[derive(
    Serialize,
    Deserialize,
    Debug,
    ToSchema,
    Copy,
    Clone,
    EnumString,
    Display,
    JsonSchema,
    Default,
    Eq,
    PartialEq,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum SearchSort {
    #[default]
    UpdatedAt,
    Relevancy,
}

#[derive(
    Serialize, Deserialize, Debug, ToSchema, Copy, Clone, EnumString, Display, PartialEq, JsonSchema,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum MatchType {
    // Exact match. Matches on full words/phrases.
    Exact,
    // Partial match. Matches on partial words/phrases.
    Partial,
    // Regex match. All terms you provide are treated as regular expressions.
    Regexp,
    #[schemars(skip)]
    // Query match. Matches using the OpenSearch Simple Query String DSL
    Query,
}

/// A generic response item
#[derive(Debug, Serialize, Deserialize, ToSchema, JsonSchema)]
pub struct SearchResponseItem<T, S> {
    // TODO: would be nice to pull id out of all the data eventually
    // /// The id of the channel
    // pub id: String,
    /// The name of the response
    pub results: Vec<T>,
    /// Optional metadata for the item
    // flattening should make this struct virtually the same
    #[serde(flatten)]
    pub metadata: S,
}

#[derive(Debug, Serialize, Deserialize, ToSchema, JsonSchema)]
pub struct SearchResponse<T> {
    /// List containing results from a request
    pub results: Vec<T>,
}

pub trait ItemId {
    fn get_id(&self) -> &String;
}

pub trait Metadata<T> {
    fn metadata(&self, id: &str) -> T;
}

#[derive(Debug, Serialize, Deserialize, ToSchema, JsonSchema, Default)]
pub struct SearchHighlight {
    /// The highlight match on the name field
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The highlight match on the content field
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub content: Vec<String>,
    /// The highlight match on the user (owner) of the entity
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// The highlight match on the sender (email only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender: Option<String>,
    /// The highlight match on the recipients (email only)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub recipients: Vec<String>,
    /// The highlight match on the cc (email only)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub cc: Vec<String>,
    /// The highlight match on the bcc (email only)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub bcc: Vec<String>,
}

impl From<opensearch_client::search::model::Highlight> for SearchHighlight {
    fn from(highlight: opensearch_client::search::model::Highlight) -> Self {
        Self {
            name: highlight.name,
            content: highlight.content,
            user_id: highlight.user_id,
            sender: highlight.sender,
            recipients: highlight.recipients,
            cc: highlight.cc,
            bcc: highlight.bcc,
        }
    }
}
