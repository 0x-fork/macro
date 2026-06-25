//! The core ToolSet trait implemented by the ToolSet and AsyncToolset
use crate::toolset::types::{RequestSchema, ToolInfo};
use crate::{
    AsyncToolCollection, RequestContext, SearchableTool, ToolAnnotations, ToolResult, ToolSetError,
};
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

    /// Returns the input schemas for the tools sent to the provider on every
    /// request. Tools loaded on demand via tool search are excluded — they are
    /// surfaced through [`Self::searchable_catalog`] instead.
    fn request_schemas(&self) -> Option<Vec<RequestSchema>>;

    /// The catalog of on-demand (searchable) tools — those not sent on every
    /// request but discoverable via the `SearchTools` tool. Defaults to empty.
    fn searchable_catalog(&self) -> Vec<SearchableTool> {
        Vec::new()
    }

    /// Names of the toolsets (e.g. connected MCP servers) whose tools are
    /// available via tool search but not advertised on every request. Used to
    /// tell the model which integrations it can reach via `SearchTools` /
    /// `LoadTools`. Defaults to empty (no searchable toolsets).
    fn searchable_toolset_names(&self) -> Vec<String> {
        Vec::new()
    }

    /// Dynamic routers use this to demangle tool names for frontend consumption
    fn routing_description<'a>(&'a self, _tool_name: &'a str) -> Option<ToolInfo> {
        None
    }

    /// MCP-style behavioural hints for the tool named `tool_name`.
    ///
    /// Two consumers read this: the permission layer (to derive a default
    /// permission from `destructive_hint` before dispatch) and MCP advertising
    /// (to expose our tools' hints to external consumers). Returns `None` when
    /// the tool is unknown to this toolset. Defaults to `None` so toolsets that
    /// carry no hints (and pre-existing impls) need not implement it.
    fn tool_annotations(&self, _tool_name: &str) -> Option<ToolAnnotations> {
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
            })
            .collect::<Vec<_>>();
        if schemas.is_empty() {
            None
        } else {
            Some(schemas)
        }
    }

    fn tool_annotations(&self, tool_name: &str) -> Option<ToolAnnotations> {
        self.tools
            .get(tool_name)
            .map(|tool| tool.annotations.clone())
    }
}

#[cfg(test)]
mod test {
    use crate::{
        AsyncTool, AsyncToolCollection, RequestContext, ServiceContext, ToolAnnotations,
        ToolResult, ToolSet,
    };
    use schemars::JsonSchema;
    use serde::{Deserialize, Serialize};

    #[derive(JsonSchema, Deserialize, Serialize)]
    #[schemars(title = "ReadThing", description = "A read-only tool")]
    struct ReadThing {
        id: String,
    }

    #[async_trait::async_trait]
    impl AsyncTool<()> for ReadThing {
        type Output = serde_json::Value;
        async fn call(
            &self,
            _ctx: ServiceContext<()>,
            _req: RequestContext,
        ) -> ToolResult<Self::Output> {
            Ok(serde_json::json!({ "id": self.id }))
        }
        // Uses the default (non-destructive) annotations.
    }

    #[derive(JsonSchema, Deserialize, Serialize)]
    #[schemars(title = "DeleteThing", description = "A destructive tool")]
    struct DeleteThing {
        id: String,
    }

    #[async_trait::async_trait]
    impl AsyncTool<()> for DeleteThing {
        type Output = serde_json::Value;
        async fn call(
            &self,
            _ctx: ServiceContext<()>,
            _req: RequestContext,
        ) -> ToolResult<Self::Output> {
            Ok(serde_json::json!({ "deleted": self.id }))
        }
        fn annotations() -> ToolAnnotations {
            ToolAnnotations::destructive()
        }
    }

    fn toolset() -> AsyncToolCollection<()> {
        AsyncToolCollection::<()>::new()
            .add_tool::<ReadThing, ()>()
            .add_tool::<DeleteThing, ()>()
    }

    #[test]
    fn non_destructive_tool_defaults_to_non_destructive() {
        let ts = toolset();
        let ann = ts.tool_annotations("ReadThing").expect("tool present");
        assert!(!ann.is_destructive());
        assert_eq!(ann.destructive_hint, None);
    }

    #[test]
    fn destructive_tool_surfaces_destructive_hint() {
        let ts = toolset();
        let ann = ts.tool_annotations("DeleteThing").expect("tool present");
        assert!(ann.is_destructive());
        assert_eq!(ann.destructive_hint, Some(true));
    }

    #[test]
    fn unknown_tool_has_no_annotations() {
        let ts = toolset();
        assert!(ts.tool_annotations("Nope").is_none());
    }

    #[test]
    fn user_tool_forwards_wrapped_annotations() {
        // A destructive user tool must still report destructive so the
        // permission layer gates it (permissions are orthogonal to user-tools).
        let ts = AsyncToolCollection::<()>::new().add_user_tool::<DeleteThing, ()>();
        let ann = ts.tool_annotations("DeleteThing").expect("tool present");
        assert!(ann.is_destructive());
    }
}
