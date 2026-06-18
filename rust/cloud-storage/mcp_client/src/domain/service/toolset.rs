use crate::domain::models::{Error, McpServer, McpServerRecord};
use crate::domain::ports::McpConnector;
use ai_toolset::{
    AsyncToolCollection, RequestContext, RequestSchema, SearchableTool, ToolCallError, ToolInfo,
    ToolLoading, ToolResult, ToolSet, ToolSetError,
};
use rmcp::RoleClient;
use rmcp::model::{CallToolRequestParams, CallToolResult, Tool};
use rmcp::service::Peer;
use schemars::Schema;
use std::collections::BTreeMap;
use std::pin::Pin;
use std::sync::Arc;

const MANGLED_PREFIX: &str = "mcp__";
const MANGLED_SEPARATOR: &str = "__";

/// Name of the always-present meta-tool the model calls to discover MCP tools.
pub const SEARCH_TOOLS_NAME: &str = "search_tools";
/// Name of the always-present meta-tool the model calls to invoke a discovered
/// MCP tool. Discovered MCP tools are not sent on every request, so the model
/// cannot call them by name directly — it proxies through this tool instead.
pub const CALL_MCP_TOOL_NAME: &str = "call_mcp_tool";
/// Cap on how many tools a single search returns, to keep results focused (the
/// provider-native tool search returns 3-5; we match that ballpark).
const MAX_SEARCH_RESULTS: usize = 8;

/// A mangled tool name in the format `mcp__<server>__<tool>`.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
struct MangledName(String);

impl MangledName {
    fn new(server_name: &str, tool_name: &str) -> Self {
        Self(format!(
            "{MANGLED_PREFIX}{server_name}{MANGLED_SEPARATOR}{tool_name}"
        ))
    }

    fn parse(s: &str) -> Option<(&str, &str)> {
        s.strip_prefix(MANGLED_PREFIX)?
            .split_once(MANGLED_SEPARATOR)
    }

    fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for MangledName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

struct RegisteredTool {
    peer: Peer<RoleClient>,
    tool: Tool,
}

/// Dispatches tool calls to connected MCP servers using name-mangled routing.
///
/// Every tool is exposed as `mcp__<server_name>__<tool_name>` to guarantee
/// uniqueness across servers.
pub struct McpToolSet {
    tools: BTreeMap<MangledName, RegisteredTool>,
    /// Kept alive so the background transport tasks aren't cancelled.
    _connections: Vec<McpServer>,
}

impl McpToolSet {
    /// Connect to every server in `records` concurrently, discover tools, and
    /// register them.
    ///
    /// Servers that fail to connect or list tools are silently skipped.
    #[tracing::instrument(skip_all)]
    pub async fn new(records: &[McpServerRecord]) -> Self {
        let futs = records
            .iter()
            .filter(|r| r.enabled)
            .map(|record| async move {
                let client = record.connect().await.inspect_err(|e| {
                    tracing::warn!(server = %record.server_name, error = ?e, "failed to connect");
                }).ok()?;

                let server_tools = match client.list_all_tools().await {
                    Ok(t) => t,
                    Err(e) => {
                        tracing::warn!(server = %record.server_name, error = ?e, "failed to list tools");
                        let _ = client.cancel().await;
                        return None;
                    }
                };

                Some((record.server_name.clone(), client, server_tools))
            });

        let results = futures::future::join_all(futs).await;

        let mut tools = BTreeMap::new();
        let mut connections = Vec::new();
        for (server_name, client, server_tools) in results.into_iter().flatten() {
            for tool in server_tools {
                let mangled = MangledName::new(&server_name, &tool.name);

                if tools.contains_key(&mangled) {
                    tracing::warn!(%mangled, "skipping duplicate tool");
                    continue;
                }

                tools.insert(
                    mangled,
                    RegisteredTool {
                        peer: client.peer().clone(),
                        tool,
                    },
                );
            }
            connections.push(client);
        }

        Self {
            tools,
            _connections: connections,
        }
    }

    /// Returns `true` when no tools were discovered.
    pub fn is_empty(&self) -> bool {
        self.tools.is_empty()
    }

    /// The full searchable catalog of MCP tools (mangled name + description +
    /// input schema), used to power the `search_tools` meta-tool.
    fn catalog(&self) -> Vec<SearchableTool> {
        self.tools
            .iter()
            .map(|(mangled, entry)| SearchableTool {
                name: mangled.as_str().to_string(),
                description: entry
                    .tool
                    .description
                    .as_deref()
                    .unwrap_or_default()
                    .to_string(),
                schema: Schema::from((*entry.tool.input_schema).clone()),
            })
            .collect()
    }

    #[tracing::instrument(skip(self, arguments), err)]
    async fn call_tool(
        &self,
        name: &str,
        arguments: serde_json::Map<String, serde_json::Value>,
    ) -> Result<CallToolResult, Error> {
        let key = MangledName(name.to_owned());
        let entry = self
            .tools
            .get(&key)
            .ok_or_else(|| Error::UnknownTool(name.to_owned()))?;

        let params = CallToolRequestParams::new(entry.tool.name.clone()).with_arguments(arguments);

        entry
            .peer
            .call_tool(params)
            .await
            .map_err(|e| Error::ToolCall(e.to_string()))
    }
}

impl<Context: Send + Sync + 'static> ToolSet<Context> for McpToolSet {
    fn try_tool_call<'a>(
        &'a self,
        _context: Context,
        _request_context: RequestContext,
        tool_name: &'a str,
        json: &'a serde_json::Value,
    ) -> Pin<
        Box<dyn Future<Output = Result<ToolResult<serde_json::Value>, ToolSetError>> + 'a + Send>,
    > {
        Box::pin(async move {
            let arguments = match json {
                serde_json::Value::Object(map) => map.clone(),
                _ => serde_json::Map::new(),
            };

            let result = match self.call_tool(tool_name, arguments).await {
                Ok(result) => result,
                Err(Error::UnknownTool(name)) => {
                    return Err(ToolSetError::NotFound(name));
                }
                Err(e) => {
                    let description = e.to_string();
                    return Ok(Err(ToolCallError {
                        internal_error: anyhow::anyhow!("{}", &description),
                        description,
                    }));
                }
            };

            let text = result
                .content
                .into_iter()
                .filter_map(|c| c.raw.as_text().map(|t| t.text.clone()))
                .collect::<Vec<_>>()
                .join("");

            if result.is_error.unwrap_or(false) {
                Ok(Err(ToolCallError {
                    internal_error: anyhow::anyhow!("{}", &text),
                    description: text,
                }))
            } else {
                Ok(Ok(serde_json::Value::String(text)))
            }
        })
    }

    fn request_schemas(&self) -> Option<Vec<RequestSchema>> {
        let schemas: Vec<_> = self
            .tools
            .iter()
            .map(|(mangled, entry)| RequestSchema {
                name: mangled.as_str().to_string(),
                schema: Schema::from((*entry.tool.input_schema).clone()),
                // MCP tools are loaded on demand via tool search, never sent
                // upfront. The catalog can be large (and grows with every MCP
                // server the user connects), so this is the key cost/perf win.
                loading: ToolLoading::Searchable,
            })
            .collect();

        if schemas.is_empty() {
            None
        } else {
            Some(schemas)
        }
    }

    fn searchable_tools(&self) -> Vec<SearchableTool> {
        self.catalog()
    }

    fn routing_description<'a>(&'a self, tool_name: &'a str) -> Option<ToolInfo> {
        let (server_name, original_name) = MangledName::parse(tool_name)?;
        let key = MangledName(tool_name.to_owned());
        let display_name = self
            .tools
            .get(&key)
            .and_then(|entry| entry.tool.title.clone());
        Some(ToolInfo::ExternalTool {
            service_name: server_name.to_owned(),
            tool_name: original_name.to_owned(),
            display_name,
        })
    }
}

/// Wraps a static [`AsyncToolCollection`] and an optional [`McpToolSet`],
/// presenting them as a single toolset to the AI loop.
pub struct CombinedToolSet<T> {
    static_tools: Arc<AsyncToolCollection<T>>,
    mcp_tools: McpToolSet,
}

impl<T> CombinedToolSet<T> {
    /// Build a combined toolset from the static tools and the user's MCP servers.
    pub async fn new(
        static_tools: Arc<AsyncToolCollection<T>>,
        records: &[McpServerRecord],
    ) -> Self {
        let mcp_tools = McpToolSet::new(records).await;
        Self {
            static_tools,
            mcp_tools,
        }
    }
}

impl<T: Send + Sync + 'static> ToolSet<T> for CombinedToolSet<T> {
    fn try_tool_call<'a>(
        &'a self,
        context: T,
        request_context: RequestContext,
        tool_name: &'a str,
        json: &'a serde_json::Value,
    ) -> Pin<
        Box<dyn Future<Output = Result<ToolResult<serde_json::Value>, ToolSetError>> + 'a + Send>,
    > {
        match tool_name {
            // Tool search: return the catalog entries matching the query so the
            // model can then call them via `call_mcp_tool`.
            SEARCH_TOOLS_NAME => {
                let result = search_tools(&self.mcp_tools.catalog(), json);
                Box::pin(async move { Ok(result) })
            }
            // Proxy: dispatch a discovered MCP tool by its (mangled) name. This
            // keeps MCP tools executable without sending their schemas upfront.
            CALL_MCP_TOOL_NAME => {
                let (resolved_name, resolved_json) = match parse_call_mcp_tool_input(json) {
                    Ok(parsed) => parsed,
                    Err(err) => return Box::pin(async move { Ok(Err(err)) }),
                };
                Box::pin(async move {
                    self.mcp_tools
                        .try_tool_call(context, request_context, &resolved_name, &resolved_json)
                        .await
                })
            }
            // Direct MCP call (e.g. a tool the model already discovered in a
            // prior turn and is calling by mangled name) routes to MCP.
            name if name.starts_with(MANGLED_PREFIX) => {
                self.mcp_tools
                    .try_tool_call(context, request_context, tool_name, json)
            }
            _ => self
                .static_tools
                .try_tool_call(context, request_context, tool_name, json),
        }
    }

    fn request_schemas(&self) -> Option<Vec<RequestSchema>> {
        // Native (first-party) tools are always sent.
        let mut schemas = self.static_tools.request_schemas().unwrap_or_default();

        // Only add the tool-search machinery when there are MCP tools to search.
        // With no MCP tools, sending `search_tools` / `call_mcp_tool` would just
        // be noise.
        if !self.mcp_tools.is_empty() {
            schemas.push(RequestSchema {
                name: SEARCH_TOOLS_NAME.to_string(),
                schema: search_tools_schema(),
                loading: ToolLoading::AlwaysInclude,
            });
            schemas.push(RequestSchema {
                name: CALL_MCP_TOOL_NAME.to_string(),
                schema: call_mcp_tool_schema(),
                loading: ToolLoading::AlwaysInclude,
            });
        }

        // MCP tools themselves are searchable, not sent upfront — they are
        // surfaced via `searchable_tools` instead.

        if schemas.is_empty() {
            None
        } else {
            Some(schemas)
        }
    }

    fn searchable_tools(&self) -> Vec<SearchableTool> {
        self.mcp_tools.catalog()
    }

    fn routing_description<'a>(&'a self, tool_name: &'a str) -> Option<ToolInfo> {
        if tool_name.starts_with(MANGLED_PREFIX) {
            <McpToolSet as ToolSet<T>>::routing_description(&self.mcp_tools, tool_name)
        } else {
            self.static_tools.routing_description(tool_name)
        }
    }
}

/// Build a [`Schema`] from a JSON object literal.
fn object_schema(value: serde_json::Value) -> Schema {
    let serde_json::Value::Object(map) = value else {
        return Schema::from(serde_json::Map::new());
    };
    Schema::from(map)
}

/// Input schema for the `search_tools` meta-tool.
fn search_tools_schema() -> Schema {
    object_schema(serde_json::json!({
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Keywords describing the capability you need (matches tool names and descriptions, case-insensitive substring match)."
            }
        },
        "required": ["query"],
        "additionalProperties": false,
    }))
}

/// Input schema for the `call_mcp_tool` proxy meta-tool.
fn call_mcp_tool_schema() -> Schema {
    object_schema(serde_json::json!({
        "type": "object",
        "properties": {
            "tool_name": {
                "type": "string",
                "description": "The exact `name` of a tool returned by search_tools."
            },
            "arguments": {
                "type": "object",
                "description": "The arguments object for the tool, matching its input schema.",
                "additionalProperties": true
            }
        },
        "required": ["tool_name", "arguments"],
        "additionalProperties": false,
    }))
}

/// Parse and validate the input to `call_mcp_tool`, returning the resolved tool
/// name and its arguments object.
fn parse_call_mcp_tool_input(
    json: &serde_json::Value,
) -> Result<(String, serde_json::Value), ToolCallError> {
    let tool_name = json
        .get("tool_name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ToolCallError {
            internal_error: anyhow::anyhow!("call_mcp_tool missing `tool_name`"),
            description: "call_mcp_tool requires a string `tool_name`".to_string(),
        })?
        .to_string();
    let arguments = json
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()));
    Ok((tool_name, arguments))
}

/// Search the MCP tool catalog for entries matching `query` (case-insensitive
/// substring over name + description) and return the matches as a JSON document
/// the model can read to decide which tool to call via `call_mcp_tool`.
fn search_tools(
    catalog: &[SearchableTool],
    json: &serde_json::Value,
) -> ToolResult<serde_json::Value> {
    let query = json
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_lowercase();

    let matches: Vec<_> = catalog
        .iter()
        .filter(|t| {
            query.is_empty()
                || t.name.to_lowercase().contains(&query)
                || t.description.to_lowercase().contains(&query)
        })
        .take(MAX_SEARCH_RESULTS)
        .map(|t| {
            serde_json::json!({
                "name": t.name,
                "description": t.description,
                "input_schema": t.schema,
            })
        })
        .collect();

    let total = catalog.len();
    let returned = matches.len();
    tracing::info!(
        query = %query,
        returned,
        total,
        "tool search executed"
    );

    Ok(serde_json::json!({
        "tools": matches,
        "returned": returned,
        "total_available": total,
        "note": "Call any of these via call_mcp_tool with tool_name set to the tool's `name`.",
    }))
}

#[cfg(test)]
mod test {
    use super::*;

    fn catalog() -> Vec<SearchableTool> {
        vec![
            SearchableTool {
                name: "mcp__slack__send_message".to_string(),
                description: "Post a message to a Slack channel".to_string(),
                schema: object_schema(serde_json::json!({"type": "object"})),
            },
            SearchableTool {
                name: "mcp__gmail__list_threads".to_string(),
                description: "List email threads in Gmail".to_string(),
                schema: object_schema(serde_json::json!({"type": "object"})),
            },
        ]
    }

    #[test]
    fn search_matches_by_name() {
        let result =
            search_tools(&catalog(), &serde_json::json!({ "query": "slack" })).expect("search ok");
        let tools = result["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], "mcp__slack__send_message");
        assert_eq!(result["total_available"], 2);
    }

    #[test]
    fn search_matches_by_description_case_insensitive() {
        // "EMAIL" matches "email threads" in the Gmail tool description.
        let result =
            search_tools(&catalog(), &serde_json::json!({ "query": "EMAIL" })).expect("search ok");
        let tools = result["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], "mcp__gmail__list_threads");
    }

    #[test]
    fn empty_query_returns_all() {
        let result =
            search_tools(&catalog(), &serde_json::json!({ "query": "" })).expect("search ok");
        assert_eq!(result["tools"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn call_mcp_tool_input_parses_name_and_arguments() {
        let (name, args) = parse_call_mcp_tool_input(&serde_json::json!({
            "tool_name": "mcp__slack__send_message",
            "arguments": { "channel": "general", "text": "hi" }
        }))
        .expect("valid input");
        assert_eq!(name, "mcp__slack__send_message");
        assert_eq!(args["channel"], "general");
    }

    #[test]
    fn call_mcp_tool_input_requires_tool_name() {
        let err = parse_call_mcp_tool_input(&serde_json::json!({ "arguments": {} }))
            .expect_err("missing tool_name should error");
        assert!(err.description.contains("tool_name"));
    }

    #[test]
    fn call_mcp_tool_input_defaults_missing_arguments_to_empty_object() {
        let (name, args) = parse_call_mcp_tool_input(&serde_json::json!({
            "tool_name": "mcp__gmail__list_threads"
        }))
        .expect("valid input");
        assert_eq!(name, "mcp__gmail__list_threads");
        assert!(args.is_object());
    }
}
