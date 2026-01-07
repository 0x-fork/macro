fn main() {
        let tool_schemas =
            serde_json::to_string_pretty(&ai_tools::all_tool_schemas()).expect("tool schemas");
        println!("{tool_schemas}");
}
