use ai_toolset::{RequestContext, RequestSchema, ToolResult, ToolSet, ToolSetError};
use std::pin::Pin;

use super::name::ToolSetName;

pub(super) type ToolSetObj<Context> = Box<dyn ToolSet<Context> + Send + Sync>;

pub(super) struct MangledToolSet<'a, Context> {
    name: ToolSetName<'a>,
    inner: ToolSetObj<Context>,
}

impl<'a, Context> MangledToolSet<'a, Context> {
    pub fn new(name: ToolSetName<'a>, inner: ToolSetObj<Context>) -> Self {
        Self { name, inner }
    }
}

impl<Context> ToolSet<Context> for MangledToolSet<'_, Context>
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
        Box<
            dyn Future<Output = std::result::Result<ToolResult<serde_json::Value>, ToolSetError>>
                + 'a
                + Send,
        >,
    > {
        Box::pin(async move {
            let (prefix, tool) = ToolSetName::demangle(tool_name)
                .map_err(|_| ToolSetError::NotFound(tool_name.to_string()))?;

            if prefix != self.name.name() {
                return Err(ToolSetError::NotFound(tool_name.to_string()));
            }

            self.inner
                .try_tool_call(context, request_context, tool, json)
                .await
        })
    }

    fn request_schemas(&self) -> Option<Vec<RequestSchema>> {
        self.inner.request_schemas().map(|schemas| {
            schemas
                .into_iter()
                .map(|schema| RequestSchema {
                    name: self.name.mangle(&schema.name),
                    schema: schema.schema,
                })
                .collect()
        })
    }
}
