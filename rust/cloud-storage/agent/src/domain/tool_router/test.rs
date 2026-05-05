use ai_toolset::{RequestContext, RequestSchema, ToolResult, ToolSet, ToolSetError};
use macro_user_id::user_id::MacroUserIdStr;
use schemars::Schema;
use std::pin::Pin;

use super::ToolRouter;
use super::mangled::MangledToolSet;
use super::name::ToolSetName;

fn test_request_context() -> RequestContext {
    RequestContext {
        user_id: MacroUserIdStr::try_from("macro|test@test.com".to_string()).unwrap(),
    }
}

fn test_schema(name: &str) -> RequestSchema {
    RequestSchema {
        name: name.to_string(),
        schema: Schema::default(),
    }
}

struct MockToolSet {
    schemas: Vec<RequestSchema>,
}

impl MockToolSet {
    fn with_tools(names: &[&str]) -> Self {
        Self {
            schemas: names.iter().map(|n| test_schema(n)).collect(),
        }
    }

    fn empty() -> Self {
        Self {
            schemas: Vec::new(),
        }
    }

    fn boxed(self) -> Box<dyn ToolSet<()> + Send + Sync> {
        Box::new(self)
    }
}

impl ToolSet<()> for MockToolSet {
    fn try_tool_call<'a>(
        &'a self,
        _context: (),
        _request_context: RequestContext,
        tool_name: &'a str,
        _json: &'a serde_json::Value,
    ) -> Pin<
        Box<dyn Future<Output = Result<ToolResult<serde_json::Value>, ToolSetError>> + Send + 'a>,
    > {
        Box::pin(async move {
            if self.schemas.iter().any(|s| s.name == tool_name) {
                Ok(Ok(serde_json::json!({ "called": tool_name })))
            } else {
                Err(ToolSetError::NotFound(tool_name.to_string()))
            }
        })
    }

    fn request_schemas(&self) -> Option<Vec<RequestSchema>> {
        if self.schemas.is_empty() {
            None
        } else {
            Some(self.schemas.iter().map(|s| test_schema(&s.name)).collect())
        }
    }
}

// --- ToolSetName ---

#[test]
fn name_new_strips_delimiters() {
    let name = ToolSetName::new("my_toolset".into()).unwrap();
    assert_eq!(name.name(), "my-toolset");
}

#[test]
fn name_new_preserves_clean_input() {
    let name = ToolSetName::new("search".into()).unwrap();
    assert_eq!(name.name(), "search");
}

#[test]
fn name_new_rejects_empty() {
    assert!(ToolSetName::new(String::new()).is_err());
}

#[test]
fn name_mangle_formats_correctly() {
    let name = ToolSetName::new("files".into()).unwrap();
    assert_eq!(name.mangle("Upload"), "files_Upload");
}

#[test]
fn name_demangle_splits_on_first_delimiter() {
    let (toolset, tool) = ToolSetName::demangle("files_Upload").unwrap();
    assert_eq!(toolset, "files");
    assert_eq!(tool, "Upload");
}

#[test]
fn name_demangle_preserves_delimiters_in_tool_name() {
    let (toolset, tool) = ToolSetName::demangle("files_Get_Upload_Status").unwrap();
    assert_eq!(toolset, "files");
    assert_eq!(tool, "Get_Upload_Status");
}

#[test]
fn name_demangle_rejects_unmangled() {
    assert!(ToolSetName::demangle("NoDelimiter").is_err());
}

// --- MangledToolSet ---

#[tokio::test]
async fn mangled_schemas_are_prefixed() {
    let name = ToolSetName::new("files".into()).unwrap();
    let inner = MockToolSet::with_tools(&["Upload", "Download"]);
    let mangled = MangledToolSet::new(name, Box::new(inner));

    let schemas = mangled.request_schemas().unwrap();
    let names: Vec<&str> = schemas.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(names, vec!["files_Upload", "files_Download"]);
}

#[tokio::test]
async fn mangled_empty_toolset_returns_none() {
    let name = ToolSetName::new("empty".into()).unwrap();
    let mangled = MangledToolSet::new(name, Box::new(MockToolSet::empty()));
    assert!(mangled.request_schemas().is_none());
}

#[tokio::test]
async fn mangled_dispatches_with_correct_prefix() {
    let name = ToolSetName::new("files".into()).unwrap();
    let inner = MockToolSet::with_tools(&["Upload"]);
    let mangled = MangledToolSet::new(name, Box::new(inner));

    let result = mangled
        .try_tool_call(
            (),
            test_request_context(),
            "files_Upload",
            &serde_json::json!({}),
        )
        .await;
    let value = result.unwrap().unwrap();
    assert_eq!(value, serde_json::json!({ "called": "Upload" }));
}

#[tokio::test]
async fn mangled_rejects_wrong_prefix() {
    let name = ToolSetName::new("files".into()).unwrap();
    let inner = MockToolSet::with_tools(&["Upload"]);
    let mangled = MangledToolSet::new(name, Box::new(inner));

    let result = mangled
        .try_tool_call(
            (),
            test_request_context(),
            "other_Upload",
            &serde_json::json!({}),
        )
        .await;
    assert!(matches!(result, Err(ToolSetError::NotFound(_))));
}

#[tokio::test]
async fn mangled_rejects_unmangled_name() {
    let name = ToolSetName::new("files".into()).unwrap();
    let inner = MockToolSet::with_tools(&["Upload"]);
    let mangled = MangledToolSet::new(name, Box::new(inner));

    let result = mangled
        .try_tool_call((), test_request_context(), "Upload", &serde_json::json!({}))
        .await;
    assert!(matches!(result, Err(ToolSetError::NotFound(_))));
}

// --- ToolRouter ---

#[tokio::test]
async fn router_empty_has_no_schemas() {
    let router: ToolRouter<()> = ToolRouter::new();
    assert!(router.request_schemas().is_none());
}

#[tokio::test]
async fn router_collects_mangled_schemas() {
    let router: ToolRouter<()> = ToolRouter::new()
        .add_toolset("files".into(), MockToolSet::with_tools(&["Upload"]).boxed())
        .unwrap()
        .add_toolset("search".into(), MockToolSet::with_tools(&["Query"]).boxed())
        .unwrap();

    let schemas = router.request_schemas().unwrap();
    let mut names: Vec<&str> = schemas.iter().map(|s| s.name.as_str()).collect();
    names.sort();
    assert_eq!(names, vec!["files_Upload", "search_Query"]);
}

#[tokio::test]
async fn router_dispatches_to_correct_toolset() {
    let router: ToolRouter<()> = ToolRouter::new()
        .add_toolset("files".into(), MockToolSet::with_tools(&["Upload"]).boxed())
        .unwrap()
        .add_toolset("search".into(), MockToolSet::with_tools(&["Query"]).boxed())
        .unwrap();

    let result = router
        .try_tool_call(
            (),
            test_request_context(),
            "search_Query",
            &serde_json::json!({}),
        )
        .await;
    let value = result.unwrap().unwrap();
    assert_eq!(value, serde_json::json!({ "called": "Query" }));
}

#[tokio::test]
async fn router_rejects_unknown_toolset() {
    let router: ToolRouter<()> = ToolRouter::new()
        .add_toolset("files".into(), MockToolSet::with_tools(&["Upload"]).boxed())
        .unwrap();

    let result = router
        .try_tool_call(
            (),
            test_request_context(),
            "unknown_Upload",
            &serde_json::json!({}),
        )
        .await;
    assert!(matches!(result, Err(ToolSetError::NotFound(_))));
}

#[tokio::test]
async fn router_rejects_unmangled_name() {
    let router: ToolRouter<()> = ToolRouter::new()
        .add_toolset("files".into(), MockToolSet::with_tools(&["Upload"]).boxed())
        .unwrap();

    let result = router
        .try_tool_call((), test_request_context(), "Upload", &serde_json::json!({}))
        .await;
    assert!(matches!(result, Err(ToolSetError::NotFound(_))));
}

#[test]
fn router_rejects_duplicate_toolset_name() {
    let result: super::super::error::Result<ToolRouter<()>> = ToolRouter::new()
        .add_toolset("files".into(), MockToolSet::with_tools(&["Upload"]).boxed())
        .unwrap()
        .add_toolset(
            "files".into(),
            MockToolSet::with_tools(&["Download"]).boxed(),
        );
    assert!(result.is_err());
}

#[test]
fn router_normalizes_toolset_names() {
    let router: ToolRouter<()> = ToolRouter::new()
        .add_toolset(
            "my_toolset".into(),
            MockToolSet::with_tools(&["Do"]).boxed(),
        )
        .unwrap();

    let schemas = router.request_schemas().unwrap();
    assert_eq!(schemas[0].name, "my-toolset_Do");
}
