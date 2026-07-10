//! GetProjection tool for reading a stored ai projection result.

use crate::domain::{
    model::{AiProjectionError, ProjectionStatus},
    projection_read_service::AiProjectionReadService,
};
use ai_toolset::{AsyncTool, RequestContext, ServiceContext, ToolCallError, ToolResult};
use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::AiProjectionToolContext;

/// Response from the GetProjection tool.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetProjectionResponse {
    /// The projection definition id that was read.
    pub projection_id: String,
    /// The materialization status of the caller's instance (`loading`, `cold`,
    /// `ready`, `refreshing`, or `error`).
    pub status: String,
    /// The stored result. JSON-encoded when the projection defines an output
    /// schema, otherwise plain text. Absent when nothing has been materialized
    /// yet.
    pub result: Option<String>,
    /// When the stored result was generated (RFC 3339).
    pub generated_at: Option<String>,
    /// When the stored result is considered stale (RFC 3339).
    pub stale_at: Option<String>,
    /// A human-readable summary of the read.
    pub summary: String,
}

/// Read the stored result of another AI projection for the current user.
#[derive(Debug, Deserialize, JsonSchema, Clone)]
#[schemars(
    title = "GetProjection",
    description = "Read the stored result of a named AI projection for the current user. AI projections are cached, periodically refreshed AI-generated views of the user's data (for example a profile of their email preferences). Use this to reuse another projection's output as context instead of re-deriving it with many tool calls. Returns the stored result plus its status and freshness timestamps. The result may be slightly stale — that is expected and it is still useful context. If the projection has no stored result yet, continue the task without it rather than waiting or retrying."
)]
#[serde(rename_all = "camelCase")]
pub struct GetProjection {
    /// The id of the projection to read (e.g. `user/email-preferences`). Only
    /// read a projection id you were explicitly given; this tool cannot list
    /// or discover projections.
    pub projection_id: String,
}

#[async_trait]
impl<S: AiProjectionReadService> AsyncTool<AiProjectionToolContext<S>> for GetProjection {
    type Output = GetProjectionResponse;

    #[tracing::instrument(skip_all, fields(
        user_id=?request_context.user_id,
        projection_id=%self.projection_id,
    ), err)]
    async fn call(
        &self,
        service_context: ServiceContext<AiProjectionToolContext<S>>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        tracing::info!("Get projection");

        let read = service_context
            .service
            .get_projection_for_user(&request_context.user_id, &self.projection_id)
            .await
            .map_err(|e| {
                let description = match &e {
                    AiProjectionError::NotFound => format!(
                        "No stored result exists for projection \"{}\" for this user. \
                         Continue the task without this context.",
                        self.projection_id
                    ),
                    other => format!("Failed to read projection: {other}"),
                };
                ToolCallError {
                    description,
                    internal_error: e.into(),
                }
            })?;

        let summary = match (&read.result, read.status) {
            (Some(_), ProjectionStatus::Refreshing) => format!(
                "Projection \"{}\" has a stored result; a refresh is in flight, so it may be \
                 slightly out of date.",
                read.projection_id
            ),
            (Some(_), _) => format!(
                "Projection \"{}\" has a stored result (status: {}).",
                read.projection_id, read.status
            ),
            (None, status) => format!(
                "Projection \"{}\" has no stored result yet (status: {status}). Continue \
                 without this context.",
                read.projection_id
            ),
        };

        Ok(GetProjectionResponse {
            projection_id: read.projection_id,
            status: read.status.to_string(),
            result: read.result,
            generated_at: read.generated_at.map(|t| t.to_rfc3339()),
            stale_at: read.stale_at.map(|t| t.to_rfc3339()),
            summary,
        })
    }
}
