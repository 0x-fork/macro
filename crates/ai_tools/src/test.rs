//! Toolset construction tests.
//!
//! Adding a tool to a toolset runs its input schema through
//! `generate_validated_input_schema` (via `AsyncToolObject::try_from_tool`),
//! which enforces the strict-mode requirements shared by OpenAI and
//! Anthropic. On a validation failure that path `.expect()`-panics, so a tool
//! with an unsupported schema (e.g. a `HashMap` that emits
//! `additionalProperties`) used to surface only at runtime when the service
//! built its toolset.
//!
//! These tests build every toolset the crate exposes. If any tool fails
//! schema validation, construction panics and the corresponding test fails —
//! turning that runtime failure into a test-time failure.

use super::*;

#[test]
fn subagent_toolset_passes_schema_validation() {
    let _ = subagent_toolset();
}

#[test]
fn all_tools_passes_schema_validation() {
    let _ = all_tools();
}

#[test]
fn mcp_tools_passes_schema_validation() {
    let _ = mcp_tools();
}

#[test]
fn no_tools_passes_schema_validation() {
    let _ = no_tools();
}

#[test]
fn search_toolset_passes_schema_validation() {
    let _ = search_toolset();
}

#[test]
fn frontend_schemas_build() {
    let _ = all_tool_frontend_schemas();
}

/// The MCP connector directory requires accurate `readOnlyHint`/
/// `destructiveHint` annotations on every tool. Guard the invariants that
/// review cares about: read-style tools must be read-only, and tools that can
/// destroy or irreversibly change data must be flagged destructive.
#[test]
fn mcp_tool_annotations_match_tool_behavior() {
    let toolset = mcp_tools().toolset;

    let read_only_prefixes = ["Read", "List", "Get", "Search"];
    let destructive_tools = [
        "EditDocument",
        "DeleteTag",
        "DeleteImportEntity",
        "Subagent",
        "BashCodeExecution",
        "TextEditorCodeExecution",
    ];
    let open_world_tools = [
        "WebSearch",
        "WebFetch",
        "ImportNotionPage",
        "Subagent",
    ];

    for (name, tool) in toolset.tools.iter() {
        let annotations = tool.annotations;
        if read_only_prefixes
            .iter()
            .any(|prefix| name.starts_with(prefix))
            || name.ends_with("Search")
        {
            assert!(
                annotations.read_only,
                "{name} looks like a read tool but is not annotated read-only"
            );
        }
        if annotations.read_only {
            assert!(
                !annotations.destructive,
                "{name} is annotated both read-only and destructive"
            );
        }
        assert_eq!(
            annotations.destructive,
            destructive_tools.contains(&name.as_str()),
            "{name} has an unexpected destructive annotation"
        );
        assert_eq!(
            annotations.open_world,
            open_world_tools.contains(&name.as_str()),
            "{name} has an unexpected open-world annotation"
        );
    }
}
