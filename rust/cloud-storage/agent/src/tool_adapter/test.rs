use super::*;

#[test]
fn empty_object_schema_gains_properties() {
    let mut schema = serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "title": "ListLabels",
        "description": "List the user's Gmail labels."
    });
    normalize_request_schema(&mut schema);
    assert_eq!(schema["properties"], serde_json::json!({}));
}

#[test]
fn object_schema_with_properties_is_unchanged() {
    let original = serde_json::json!({
        "type": "object",
        "properties": { "input": { "type": "string" } },
        "required": ["input"]
    });
    let mut schema = original.clone();
    normalize_request_schema(&mut schema);
    assert_eq!(schema, original);
}

#[test]
fn nested_empty_objects_gain_properties() {
    let mut schema = serde_json::json!({
        "type": "object",
        "properties": {
            "config": { "type": "object" },
            "variants": { "anyOf": [{ "type": "object" }, { "type": "null" }] },
            "list": { "type": "array", "items": { "type": "object" } }
        },
        "$defs": {
            "Empty": { "type": "object" }
        }
    });
    normalize_request_schema(&mut schema);
    assert_eq!(
        schema["properties"]["config"]["properties"],
        serde_json::json!({})
    );
    assert_eq!(
        schema["properties"]["variants"]["anyOf"][0]["properties"],
        serde_json::json!({})
    );
    assert_eq!(
        schema["properties"]["list"]["items"]["properties"],
        serde_json::json!({})
    );
    assert_eq!(
        schema["$defs"]["Empty"]["properties"],
        serde_json::json!({})
    );
}

#[test]
fn non_object_schemas_are_unchanged() {
    let original = serde_json::json!({ "type": "string", "description": "plain" });
    let mut schema = original.clone();
    normalize_request_schema(&mut schema);
    assert_eq!(schema, original);
}

// --- from_toolset native-vs-searchable filtering ---

use ai_toolset::{
    RequestContext, RequestSchema, ToolLoading, ToolResult, ToolSet as AiToolSet, ToolSetError,
};
use std::pin::Pin;

/// A minimal toolset exposing a mix of always-include and searchable tools.
struct MixedToolSet;

impl AiToolSet<()> for MixedToolSet {
    fn try_tool_call<'a>(
        &'a self,
        _context: (),
        _request_context: RequestContext,
        _tool_name: &'a str,
        _json: &'a serde_json::Value,
    ) -> Pin<
        Box<dyn Future<Output = Result<ToolResult<serde_json::Value>, ToolSetError>> + 'a + Send>,
    > {
        Box::pin(async move { Ok(Ok(serde_json::Value::Null)) })
    }

    fn request_schemas(&self) -> Option<Vec<RequestSchema>> {
        Some(vec![
            RequestSchema {
                name: "native_a".to_string(),
                schema: schemars::Schema::default(),
                loading: ToolLoading::AlwaysInclude,
            },
            RequestSchema {
                name: "native_b".to_string(),
                schema: schemars::Schema::default(),
                loading: ToolLoading::AlwaysInclude,
            },
            RequestSchema {
                name: "mcp__slack__send".to_string(),
                schema: schemars::Schema::default(),
                loading: ToolLoading::Searchable,
            },
            RequestSchema {
                name: "mcp__slack__read".to_string(),
                schema: schemars::Schema::default(),
                loading: ToolLoading::Searchable,
            },
        ])
    }
}

#[test]
fn from_toolset_registers_only_always_include_tools() {
    let toolset: Arc<dyn AiToolSet<()> + Send + Sync> = Arc::new(MixedToolSet);
    let user_id = macro_user_id::user_id::MacroUserIdStr::try_from_email("test@example.com")
        .expect("valid user id");
    let request_context = Arc::new(RwLock::new(RequestContext { user_id }));
    let adapters = DynToolSetAdapter::from_toolset(toolset, Arc::new(()), request_context);

    let names: Vec<String> = adapters.iter().map(|a| a.name.clone()).collect();
    // Native tools are registered; searchable (MCP) tools are excluded so they
    // are not sent to the provider on every request.
    assert_eq!(names, vec!["native_a".to_string(), "native_b".to_string()]);
    assert!(!names.iter().any(|n| n.starts_with("mcp__")));
}
