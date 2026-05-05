mod request;
pub mod response;
pub mod stream;
mod tool_call;

use crate::domain::provider::{AiProvider, ProviderToolCall, ToolOutput};
use ai::tool::types::{StreamPart, ToolResponse};
use ai::types::AiError;
use anthropic::prelude::{Client, ToolUse};
pub use request::AnthropicRequest;
pub use response::AnthropicResponse;
pub use stream::AnthropicStream;

impl<'a> From<&'a ToolOutput<'a, ToolUse>> for StreamPart {
    fn from(output: &'a ToolOutput<'a, ToolUse>) -> Self {
        StreamPart::ToolResponse(ToolResponse::Json {
            id: output.call.id().to_string(),
            json: output.result.clone(),
            name: output.call.name().to_string(),
        })
    }
}

pub struct AnthropicProvider {
    client: Client,
}

impl AnthropicProvider {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    pub fn from_env() -> Self {
        Self::new(Client::dangerously_try_from_env(None))
    }
}

impl AiProvider for AnthropicProvider {
    type Request = AnthropicRequest;
    type Response = AnthropicResponse;
    type StreamItem = StreamPart;
    type Error = AiError;
    type Stream = AnthropicStream;

    async fn send_request(&self, request: &AnthropicRequest) -> Result<AnthropicStream, AiError> {
        let stream = self.client.chat().create_stream(request.body.clone()).await;
        Ok(AnthropicStream::new(stream))
    }
}
