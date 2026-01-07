use crate::{core::model::CHAT_MODELS, model::response::models::AIModel};

mod core;
mod model;

fn main() {
    let models: Vec<AIModel> = CHAT_MODELS.iter().map(|m| (*m).into()).collect();
    let json = serde_json::json!({
        "tool_schemas": ai_tools::all_tool_schemas(),
        "models": models,
    });
    println!("{}", serde_json::to_string_pretty(&json).unwrap());
}
