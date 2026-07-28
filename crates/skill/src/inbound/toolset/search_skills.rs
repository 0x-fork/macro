//! `SearchSkills` tool — lets the AI discover the user's skills.

use ai_toolset::{AsyncTool, RequestContext, ServiceContext, ToolCallError, ToolResult};
use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::domain::models::Skill;
use crate::domain::ports::SkillQueryService;

use super::SkillToolContext;

/// Search or list the user's skills — reusable AI-instruction documents that
/// can be attached to a chat input via a `/<skillname>` slash command.
#[derive(Debug, Deserialize, JsonSchema, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "SearchSkills",
    description = "Search the user's skills (reusable AI-instruction documents). Omit `query` to list all skills."
)]
pub struct SearchSkills {
    #[schemars(description = "Optional search text to filter skills by name.")]
    pub query: Option<String>,
}

/// Response for the [`SearchSkills`] tool.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchSkillsResponse {
    /// The matching skills.
    pub skills: Vec<Skill>,
}

#[async_trait]
impl<SkillSvc> AsyncTool<SkillToolContext<SkillSvc>> for SearchSkills
where
    SkillSvc: SkillQueryService,
{
    type Output = SearchSkillsResponse;

    #[tracing::instrument(skip_all, fields(user_id=?request_context.user_id, query=?self.query), err)]
    async fn call(
        &self,
        service_context: ServiceContext<SkillToolContext<SkillSvc>>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        let skills = match self.query.as_deref() {
            Some(query) if !query.trim().is_empty() => {
                service_context
                    .service
                    .search_skills(&request_context.user_id, query)
                    .await
            }
            _ => {
                service_context
                    .service
                    .list_skills(&request_context.user_id)
                    .await
            }
        }
        .map_err(|e| ToolCallError {
            description: "unable to search skills".to_string(),
            internal_error: e.into(),
        })?;

        Ok(SearchSkillsResponse { skills })
    }
}
