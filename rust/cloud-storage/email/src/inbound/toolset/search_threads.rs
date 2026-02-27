//! SearchEmailThreads tool for browsing email threads.

use crate::domain::{
    models::{GetEmailsRequest, PreviewView, PreviewViewStandardLabel},
    ports::EmailService,
};
use ai::tool::{AsyncTool, RequestContext, ServiceContext, ToolCallError, ToolResult};
use async_trait::async_trait;
use models_pagination::{Query, SimpleSortMethod, TypeEraseCursor};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::EmailToolContext;

/// Internal limit for results - not exposed to agents
const RESULT_LIMIT: u16 = 50;

/// Which email view to search in
#[derive(Debug, Clone, Copy, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EmailView {
    #[default]
    Inbox,
    Sent,
    Drafts,
    Starred,
    All,
    Important,
    Other,
}

impl From<EmailView> for PreviewView {
    fn from(view: EmailView) -> Self {
        PreviewView::StandardLabel(match view {
            EmailView::Inbox => PreviewViewStandardLabel::Inbox,
            EmailView::Sent => PreviewViewStandardLabel::Sent,
            EmailView::Drafts => PreviewViewStandardLabel::Drafts,
            EmailView::Starred => PreviewViewStandardLabel::Starred,
            EmailView::All => PreviewViewStandardLabel::All,
            EmailView::Important => PreviewViewStandardLabel::Important,
            EmailView::Other => PreviewViewStandardLabel::Other,
        })
    }
}

/// How to sort the results
#[derive(Debug, Clone, Copy, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SortBy {
    #[default]
    RecentlyViewed,
    RecentlyUpdated,
    RecentlyCreated,
}

impl From<SortBy> for SimpleSortMethod {
    fn from(sort: SortBy) -> Self {
        match sort {
            SortBy::RecentlyViewed => SimpleSortMethod::ViewedAt,
            SortBy::RecentlyUpdated => SimpleSortMethod::UpdatedAt,
            SortBy::RecentlyCreated => SimpleSortMethod::CreatedAt,
        }
    }
}

/// A summary of an email thread
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSummary {
    /// The thread id
    pub id: Uuid,
    /// The subject of the thread
    pub subject: Option<String>,
    /// A snippet of the thread content
    pub snippet: Option<String>,
    /// The sender's display name
    pub sender_name: Option<String>,
    /// The sender's email address
    pub sender_email: Option<String>,
    /// Whether the thread has been read
    pub is_read: bool,
    /// Whether this is a draft
    pub is_draft: bool,
    /// Whether the thread has attachments
    pub has_attachments: bool,
    /// Number of attachments
    pub attachment_count: usize,
    /// Label names on the thread
    pub labels: Vec<String>,
    /// Number of participants
    pub participant_count: usize,
    /// The timestamp used for sorting
    pub timestamp: String,
}

/// The response from searching email threads
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchEmailThreadsResponse {
    /// The matching threads
    pub threads: Vec<ThreadSummary>,
    /// A summary of the results
    pub summary: String,
}

/// Search the user's email threads
#[derive(Debug, Deserialize, JsonSchema, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "SearchEmailThreads",
    description = "Search the user's email threads. Returns a list of email thread summaries from the specified view, sorted by the chosen method. Use this to find emails, check the inbox, or browse sent/draft/starred emails."
)]
pub struct SearchEmailThreads {
    #[schemars(
        description = "Which email view to search. Options: inbox (default), sent, drafts, starred, all, important, other."
    )]
    #[serde(default)]
    pub view: Option<EmailView>,

    #[schemars(
        description = "How to sort results: recently_viewed (default), recently_updated, or recently_created."
    )]
    #[serde(default)]
    pub sort_by: SortBy,
}

#[async_trait]
impl<T> AsyncTool<EmailToolContext<T>> for SearchEmailThreads
where
    T: EmailService,
{
    type Output = SearchEmailThreadsResponse;

    #[tracing::instrument(skip_all, fields(user_id=?request_context.user_id), err)]
    async fn call(
        &self,
        service_context: ServiceContext<EmailToolContext<T>>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        tracing::info!(params=?self, "Search email threads");

        let user_id = &*request_context.user_id;

        let link = service_context
            .service
            .get_link_by_macro_id(user_id.clone())
            .await
            .map_err(|e| ToolCallError {
                description: "Failed to look up email link".to_string(),
                internal_error: e.into(),
            })?
            .ok_or_else(|| ToolCallError {
                description:
                    "No email account linked. The user needs to connect their email first."
                        .to_string(),
                internal_error: anyhow::anyhow!("No email link found for user"),
            })?;

        let view = self.view.unwrap_or_default().into();
        let sort_method = SimpleSortMethod::from(self.sort_by);

        let result = service_context
            .service
            .get_email_thread_previews(GetEmailsRequest {
                view,
                link_id: link.id,
                macro_id: user_id.clone(),
                limit: Some(RESULT_LIMIT as u32),
                query: Query::Sort(sort_method, None),
            })
            .await
            .map_err(|e| ToolCallError {
                description: format!("Failed to search email threads: {e}"),
                internal_error: e.into(),
            })?;

        let paginated = result.type_erase();
        let has_more = paginated.next_cursor.is_some();

        let threads: Vec<ThreadSummary> = paginated
            .items
            .into_iter()
            .map(|enriched| ThreadSummary {
                id: enriched.thread.id,
                subject: enriched.thread.name,
                snippet: enriched.thread.snippet,
                sender_name: enriched.thread.sender_name,
                sender_email: enriched.thread.sender_email,
                is_read: enriched.thread.is_read,
                is_draft: enriched.thread.is_draft,
                has_attachments: !enriched.attachments.is_empty(),
                attachment_count: enriched.attachments.len(),
                labels: enriched.labels.into_iter().map(|l| l.name).collect(),
                participant_count: enriched.participants.len(),
                timestamp: enriched.thread.sort_ts.to_rfc3339(),
            })
            .collect();

        let count = threads.len();
        let summary = if threads.is_empty() {
            "No email threads found.".to_string()
        } else if has_more {
            format!("Showing {count} email threads. More results available.")
        } else {
            format!("Found {count} email threads.")
        };

        Ok(SearchEmailThreadsResponse { threads, summary })
    }
}
