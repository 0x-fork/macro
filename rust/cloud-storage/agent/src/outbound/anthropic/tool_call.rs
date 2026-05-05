use crate::domain::provider::ProviderToolCall;
use anthropic::prelude::ToolUse;
use serde_json::Value;

impl ProviderToolCall for ToolUse {
    fn name(&self) -> &str {
        &self.name
    }

    fn arguments(&self) -> &Value {
        &self.input
    }

    fn id(&self) -> &str {
        &self.id
    }
}
