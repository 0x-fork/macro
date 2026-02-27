use super::search_threads::{SearchEmailThreads, SearchEmailThreadsResponse, SortBy};
use ai::generate_tool_input_schema;
use ai::tool::types::tool_object::validate_tool_schema;

#[test]
fn test_search_email_threads_schema_validation() {
    let schema = generate_tool_input_schema!(SearchEmailThreads);

    let result = validate_tool_schema(&schema);
    assert!(result.is_ok(), "{:?}", result);

    let (name, description) = result.unwrap();
    assert_eq!(
        name, "SearchEmailThreads",
        "Tool name should match the schemars title"
    );
    assert!(
        description.contains("Search the user's email threads"),
        "Description should contain expected text"
    );
}

#[test]
fn test_default_values() {
    let search = SearchEmailThreads::default();
    assert!(search.view.is_none());
    assert!(matches!(search.sort_by, SortBy::RecentlyViewed));
}

// run `cargo test -p email inbound::toolset::test::print_input_schema -- --nocapture --include-ignored`
#[test]
#[ignore = "prints the input schema"]
fn print_input_schema() {
    let schema = generate_tool_input_schema!(SearchEmailThreads);
    println!("{}", serde_json::to_string_pretty(&schema).unwrap());
}

// run `cargo test -p email inbound::toolset::test::print_output_schema -- --nocapture --include-ignored`
#[test]
#[ignore = "prints the output schema"]
fn print_output_schema() {
    let generator = ai::tool::minimized_output_schema_generator();
    let schema = generator.into_root_schema_for::<SearchEmailThreadsResponse>();
    println!("{}", serde_json::to_string_pretty(&schema).unwrap());
}
