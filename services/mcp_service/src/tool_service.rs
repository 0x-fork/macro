use ai_toolset::{AsyncToolCollection, RequestContext, ToolSet};
use macro_user_id::user_id::MacroUserIdStr;
use rmcp::{
    handler::server::ServerHandler,
    model::{
        Content, ListToolsResult, PaginatedRequestParams, ProgressNotificationParam,
        RequestParamsMeta, ServerCapabilities, ServerInfo, Tool,
    },
};
use std::future::Future;
use std::sync::Arc;
use tokio::time::Duration;

/// How often to notify the MCP client of progress while a tool call is in
/// flight, when the client asked for progress updates (via a `progressToken`
/// on the request). `EditDocument` in particular can chain several LLM calls
/// and take multiple minutes; without periodic progress notifications, MCP
/// clients apply their own request timeout and give up on an otherwise
/// still-running, eventually-successful call.
const PROGRESS_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(10);

/// Runs `future` to completion, calling `on_tick` every
/// [`PROGRESS_HEARTBEAT_INTERVAL`] while it is still pending.
async fn with_heartbeat<F, Fut>(mut on_tick: impl FnMut() -> Fut, future: F) -> F::Output
where
    F: Future,
    Fut: Future<Output = ()>,
{
    tokio::pin!(future);
    let mut interval = tokio::time::interval(PROGRESS_HEARTBEAT_INTERVAL);
    interval.tick().await; // first tick fires immediately; skip it
    loop {
        tokio::select! {
            output = &mut future => return output,
            _ = interval.tick() => on_tick().await,
        }
    }
}

/// MCP server handler that extracts authenticated user identity from HTTP
/// request parts injected by rmcp's `StreamableHttpService`.
#[allow(
    dead_code,
    reason = "fields used via ServerHandler trait impl dispatched by rmcp"
)]
pub struct AuthenticatedToolService<Context> {
    toolset: Arc<AsyncToolCollection<Context>>,
    context: Context,
    /// Base URL of the Macro web app used to build links to Macro items in MCP
    /// responses (e.g. `https://macro.com`). Comes from the `APP_BASE_URL`
    /// environment variable.
    item_base_url: String,
}

impl<Context> AuthenticatedToolService<Context> {
    /// Creates a new authenticated tool service.
    pub fn new(
        toolset: Arc<AsyncToolCollection<Context>>,
        context: Context,
        item_base_url: String,
    ) -> Self {
        Self {
            toolset,
            context,
            item_base_url,
        }
    }

    fn tool_definitions(&self) -> Vec<Tool> {
        self.toolset
            .tools
            .iter()
            .map(|(key, value)| {
                Tool::new(
                    key.to_owned(),
                    value.description.to_owned(),
                    Arc::new(value.input_schema.clone()),
                )
            })
            .collect()
    }

    fn authenticated_user_id(
        extensions: &rmcp::model::Extensions,
    ) -> Result<MacroUserIdStr<'static>, rmcp::ErrorData> {
        extensions
            .get::<http::request::Parts>()
            .and_then(|parts| parts.extensions.get::<MacroUserIdStr<'static>>().cloned())
            .ok_or_else(|| {
                rmcp::ErrorData::internal_error("missing user identity — is auth configured?", None)
            })
    }
}

#[cfg(test)]
mod test;

impl<Context> ServerHandler for AuthenticatedToolService<Context>
where
    Context: Clone + Send + Sync + 'static,
{
    fn get_info(&self) -> ServerInfo {
        let mut info = ServerInfo::new(ServerCapabilities::builder().enable_tools().build());
        info.server_info = rmcp::model::Implementation::new(
            "macro-tools",
            env!("CARGO_PKG_VERSION"),
        )
        .with_title("Macro")
        .with_description(
            "Search, read, and create content across documents, emails, and messages in Macro.",
        );
        let base_url = self.item_base_url.trim_end_matches('/');
        info.instructions = Some(format!(
            "This server provides tools for interacting with a user's Macro workspace. \
             Use ContentSearch and NameSearch to find entities. \
             Use ReadContent, ReadMetadata, and ReadThread to read them. \
             Use CreateDocument to create new documents. \
             Use EditDocument to edit existing documents. \
             Use ListEntities to browse recent items.\n\n{}",
            prompt::mcp_instructions(base_url),
        ));
        info
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        context: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> Result<ListToolsResult, rmcp::ErrorData> {
        Self::authenticated_user_id(&context.extensions)?;

        Ok(ListToolsResult {
            tools: self.tool_definitions(),
            ..Default::default()
        })
    }

    async fn call_tool(
        &self,
        request: rmcp::model::CallToolRequestParams,
        context: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> Result<rmcp::model::CallToolResult, rmcp::ErrorData> {
        let user_id = Self::authenticated_user_id(&context.extensions)?;

        let request_context = RequestContext::new(user_id);
        let progress_token = request.progress_token();

        let arguments = request
            .arguments
            .map(serde_json::Value::Object)
            .ok_or(rmcp::ErrorData::invalid_params("No params provided", None))?;

        let tool_call = self.toolset.try_tool_call(
            self.context.clone(),
            request_context,
            &request.name,
            &arguments,
        );

        let result = match progress_token {
            Some(progress_token) => {
                let peer = context.peer.clone();
                let mut progress = 0.0;
                with_heartbeat(
                    || {
                        progress += 1.0;
                        let peer = peer.clone();
                        let notification =
                            ProgressNotificationParam::new(progress_token.clone(), progress);
                        async move {
                            if let Err(error) = peer.notify_progress(notification).await {
                                tracing::warn!(
                                    error = ?error,
                                    "failed to send MCP progress notification"
                                );
                            }
                        }
                    },
                    tool_call,
                )
                .await
            }
            None => tool_call.await,
        };

        let result = result.map_err(|error| match error {
            ai_toolset::ToolSetError::Deserialization(error) => {
                rmcp::ErrorData::parse_error(error.to_string(), None)
            }
            ai_toolset::ToolSetError::NotFound(message) => {
                rmcp::ErrorData::resource_not_found(message, None)
            }
        })?;

        match result {
            Ok(value) => Ok(rmcp::model::CallToolResult::structured(value)),
            Err(error) => Ok(rmcp::model::CallToolResult::error(vec![Content::text(
                error.description,
            )])),
        }
    }
}
