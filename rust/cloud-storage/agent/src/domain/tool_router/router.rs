use ai_toolset::{RequestContext, RequestSchema, ToolResult, ToolSet, ToolSetError};
use std::collections::BTreeMap;
use std::pin::Pin;

use super::mangled::MangledToolSet;
use super::mangled::ToolSetObj;
use super::name::ToolSetName;
use crate::domain::error::{AgentError, Result};

/// A collection of ToolSet that also implements ToolSet.
/// Names are mangled by toolset prefix to prevent collisions.
#[derive(Default)]
pub struct ToolRouter<Context> {
    toolsets: BTreeMap<ToolSetName<'static>, MangledToolSet<'static, Context>>,
}

impl<Context> ToolRouter<Context> {
    /// Creates an empty router.
    pub fn new() -> Self {
        Self {
            toolsets: BTreeMap::new(),
        }
    }

    /// Adds a toolset, returning the router for chaining.
    pub fn add_toolset<T>(mut self, name: String, toolset: T) -> Result<Self>
    where
        T: Into<ToolSetObj<Context>>,
    {
        let name = ToolSetName::new(name)?;
        if self.toolsets.contains_key(&name) {
            return Err(AgentError::ToolRouter(format!(
                "duplicate toolset name: {}",
                name.name()
            )));
        }
        let mangled = MangledToolSet::new(name.clone(), toolset.into());
        self.toolsets.insert(name, mangled);
        Ok(self)
    }
}

impl<Context> ToolSet<Context> for ToolRouter<Context>
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
            let (toolset_name, _) = ToolSetName::demangle(tool_name)
                .map_err(|_| ToolSetError::NotFound(tool_name.to_string()))?;

            let (_, mangled) = self
                .toolsets
                .iter()
                .find(|(name, _)| name.name() == toolset_name)
                .ok_or_else(|| ToolSetError::NotFound(toolset_name.to_string()))?;

            mangled
                .try_tool_call(context, request_context, tool_name, json)
                .await
        })
    }

    fn request_schemas(&self) -> Option<Vec<RequestSchema>> {
        let schemas: Vec<RequestSchema> = self
            .toolsets
            .values()
            .flat_map(|toolset| toolset.request_schemas().unwrap_or_default())
            .collect();

        if schemas.is_empty() {
            None
        } else {
            Some(schemas)
        }
    }
}
