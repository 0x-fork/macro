use crate::domain::provider::ProviderResponse;
use anthropic::prelude::{StopReason, ToolUse, Usage};
use non_empty::NonEmpty;

#[derive(Clone, Default)]
pub struct AnthropicResponse {
    pub text: String,
    pub tool_calls: Vec<ToolUse>,
    pub stop_reason: Option<StopReason>,
    pub usage: Option<Usage>,
}

impl ProviderResponse for AnthropicResponse {
    type ToolCall = ToolUse;

    fn tool_calls(&self) -> Option<NonEmpty<Vec<ToolUse>>> {
        NonEmpty::new(self.tool_calls.clone()).ok()
    }
}
