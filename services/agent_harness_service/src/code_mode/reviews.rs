//! Compose persistent reviews with existing tool actions and the session queue.
use agent_code_mode::domain::{CodeModeError, reviews::*};
use agent_session::domain::{
    model::AgentSessionId,
    ports::{AgentSessionNotificationRecipient, AgentSessionRepo},
};
use ai_toolset::RequestContext;
use async_trait::async_trait;
use macro_user_id::user_id::MacroUserIdStr;
use serde_json::Value;
use std::sync::Arc;

#[cfg(test)]
mod test;

pub struct Actions<S, H> {
    pub sessions: S,
    pub harness: Arc<H>,
    pub context: ai_tools::ToolServiceContext,
    pub tools: Arc<ai_tools::AiToolSet>,
}
#[async_trait]
impl<S: AgentSessionRepo, H: AgentSessionNotificationRecipient> ReviewActions for Actions<S, H> {
    async fn session(&self, session: AgentSessionId) -> Result<ReviewSession, CodeModeError> {
        let row = self
            .sessions
            .get(session)
            .await
            .map_err(|_| CodeModeError::NotFound)?;
        Ok(ReviewSession {
            owner: row
                .owner_user()
                .cloned()
                .map_err(|_| CodeModeError::Forbidden)?,
            archived: row.is_archived,
            prompter: self
                .sessions
                .turn_prompter(session)
                .await
                .map_err(|error| CodeModeError::Storage(rootcause::report!(error).into()))?,
        })
    }
    fn validate(&self, kind: ReviewKind, draft: &Value) -> Result<(), CodeModeError> {
        validate_draft(&self.tools, kind, draft)
    }
    async fn execute(
        &self,
        owner: &MacroUserIdStr<'static>,
        kind: ReviewKind,
        draft: Value,
    ) -> Result<Value, CodeModeError> {
        let name = match kind {
            ReviewKind::Email => "SendEmail",
            ReviewKind::Calendar => "CreateCalendarEvent",
        };
        let mut context = self.context.clone();
        context.usage_context =
            ai_usage::UsageContext::new(ai_usage::AiFeature::AgentSession, owner.clone());
        let result = self
            .tools
            .try_user_tool_call(context, RequestContext::new(owner.clone()), name, &draft)
            .await
            .map_err(|_| CodeModeError::Invalid("Could not submit the reviewed action.".into()))?
            .map_err(|_| {
                CodeModeError::Invalid(
                    "The reviewed action did not return a confirmed outcome.".into(),
                )
            })?;
        match result {
            ai_toolset::tool_object::UserToolResponse::UserAction(value) => Ok(value),
            _ => Err(CodeModeError::Invalid(
                "The action was not completed.".into(),
            )),
        }
    }
    async fn present(
        &self,
        owner: &MacroUserIdStr<'static>,
        record: &ReviewRecord,
    ) -> Result<(), CodeModeError> {
        self.harness.present_tool(
            record.session_id,
            owner.clone(),
            agent_session::domain::model::SessionToolPresentation {
                tool_call_id: format!("review_{}", record.id.0),
                title: "mcp__macro_internal__PresentReview".into(),
                raw_input: serde_json::json!({"reviewId": record.id, "kind": record.kind, "title": record.title}),
                raw_output: serde_json::json!({"reviewId": record.id, "message": "Presented to the user"}),
            },
        ).await.map_err(|_| CodeModeError::Invalid(format!("Review {} was saved, but presentation is pending. Read this review to retry presentation without creating another draft.", record.id.0)))
    }
}

fn validate_draft(
    tools: &ai_tools::AiToolSet,
    kind: ReviewKind,
    draft: &Value,
) -> Result<(), CodeModeError> {
    let invalid =
        || CodeModeError::Invalid("Draft does not match the review component's schema.".into());
    match kind {
        ReviewKind::Email => {
            if !tools.is_valid_tool("SendEmail", draft) {
                return Err(invalid());
            }
        }
        ReviewKind::Calendar => {
            if !tools.is_valid_tool("CreateCalendarEvent", draft) {
                return Err(invalid());
            }
        }
    }
    Ok(())
}
