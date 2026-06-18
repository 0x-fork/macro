//! The core ToolSet trait implemented by the ToolSet and AsyncToolset
use crate::toolset::types::{RequestSchema, SearchableTool, ToolInfo, ToolLoading};
use crate::{AsyncToolCollection, RequestContext, ToolResult, ToolSetError};
use std::pin::Pin;

/// An object with a set of tools
pub trait ToolSet<Context>: Send + Sync {
    /// Try to call a tool indexed by name with the provided raw json
    fn try_tool_call<'a>(
        &'a self,
        context: Context,
        request_context: RequestContext,
        tool_name: &'a str,
        json: &'a serde_json::Value,
    ) -> Pin<
        Box<dyn Future<Output = Result<ToolResult<serde_json::Value>, ToolSetError>> + 'a + Send>,
    >;

    /// Returns the input schemas for all tools in the toolset, or `None` if the toolset is empty.
    ///
    /// Each schema carries a [`ToolLoading`] flag describing whether the tool is
    /// always sent to the provider or loaded on demand via tool search.
    fn request_schemas(&self) -> Option<Vec<RequestSchema>>;

    /// Returns the catalog of searchable (on-demand) tools — those whose
    /// [`RequestSchema::loading`] is [`ToolLoading::Searchable`].
    ///
    /// The agent layer uses this to power the `search_tools` meta-tool: rather
    /// than sending these schemas on every request, it lets the model discover
    /// them by name/description and load only the ones it needs.
    fn searchable_tools(&self) -> Vec<SearchableTool> {
        self.request_schemas()
            .unwrap_or_default()
            .into_iter()
            .filter(|s| s.loading == ToolLoading::Searchable)
            .map(|s| SearchableTool {
                name: s.name,
                description: String::new(),
                schema: s.schema,
            })
            .collect()
    }

    /// Dynamic routers use this to demangle tool names for frontend consumption
    fn routing_description<'a>(&'a self, _tool_name: &'a str) -> Option<ToolInfo> {
        None
    }
}

impl<Context> ToolSet<Context> for AsyncToolCollection<Context>
where
    Context: Send + Sync + 'static,
{
    fn try_tool_call<'a>(
        &'a self,
        context: Context,
        request_context: RequestContext,
        tool_name: &'a str,
        json: &'a serde_json::Value,
    ) -> Pin<
        Box<dyn Future<Output = Result<ToolResult<serde_json::Value>, ToolSetError>> + 'a + Send>,
    > {
        Box::pin(self.try_tool_call_internal(context, request_context, tool_name, json))
    }

    fn request_schemas(&self) -> Option<Vec<RequestSchema>> {
        let schemas = self
            .tools
            .values()
            .map(|tool| RequestSchema {
                name: tool.name.clone(),
                schema: tool.input_schema.clone().into(),
                // Native (first-party) tools are always sent.
                loading: ToolLoading::AlwaysInclude,
            })
            .collect::<Vec<_>>();
        if schemas.is_empty() {
            None
        } else {
            Some(schemas)
        }
    }
}
