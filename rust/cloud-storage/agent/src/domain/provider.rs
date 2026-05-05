//! The agent loop makes many requests to an AI provider for a single
//! assistant turn. When the assistant chooses to do something that
//! requires a system response (i.e. using a tool), the result is
//! computed and sent back to the provider in a subsequent request.
//!
//! This multi-step loop is presented as a single assistant response
//! to the user.
//!
//! ```text
//! FUNCTION send_message(provider, request, toolset, context):
//!     Loop up to MAX_RECURSIONS times:
//!         stream = provider.send_request(request)
//!         for item in stream:
//!             yield item
//!         response = stream.finalize()
//!         match response.tool_calls():
//!             None =>
//!                 request = request.merge_response(response)
//!                 break
//!             Some(tool_calls) =>
//!                 tool_results = execute(tool_calls, toolset, context)
//!                 request = request
//!                     .merge_response(response)
//!                     .merge_tool_results(tool_results)
//!                 continue
//!     return request.into_messages()
//! ```

use ai::types::ChatMessage;
use futures::Stream;
use non_empty::NonEmpty;
use serde_json::Value;

/// Abstraction over an AI inference provider (e.g. OpenAI, Anthropic).
pub trait AiProvider: Send + Sync {
    type Request: ProviderRequest<Response = Self::Response>;
    type Response: ProviderResponse;
    type StreamItem: Send
        + for<'a> From<&'a ToolOutput<'a, <Self::Response as ProviderResponse>::ToolCall>>;
    type Error: Send;
    type Stream: ProviderStream<Item = Result<Self::StreamItem, Self::Error>, Response = Self::Response>;

    fn send_request(
        &self,
        request: &Self::Request,
    ) -> impl Future<Output = Result<Self::Stream, Self::Error>> + Send;
}

/// A stream of items from a provider that accumulates into a response.
pub trait ProviderStream: Stream + Send + Unpin {
    type Response: ProviderResponse;

    fn finalize(self) -> Self::Response;
}

/// The accumulated response from a fully-consumed provider stream.
pub trait ProviderResponse: Send {
    type ToolCall: ProviderToolCall;

    fn tool_calls(&self) -> Option<NonEmpty<Vec<Self::ToolCall>>>;
}

/// A single tool invocation requested by the model.
pub trait ProviderToolCall: Send + Sync {
    fn name(&self) -> &str;
    fn arguments(&self) -> &Value;
    fn id(&self) -> &str;
}

pub struct ToolOutput<'a, T: ProviderToolCall> {
    pub call: &'a T,
    pub result: Value,
}

/// A request to an AI provider that can be incrementally built up
/// with tool results across loop iterations.
///
/// The request is the source of truth for conversation state.
/// [`into_messages`](ProviderRequest::into_messages) resolves any
/// unmatched tool calls and converts to the domain representation.
pub trait ProviderRequest: Send + FromDomainRequest {
    type Response: ProviderResponse;
    type ToolSchema;
    type SystemPrompt;

    fn merge_response(self, response: Self::Response) -> Self;
    fn merge_tool_outputs<'a>(
        self,
        outputs: NonEmpty<Vec<ToolOutput<'a, <Self::Response as ProviderResponse>::ToolCall>>>,
    ) -> Self;
    fn with_tools(self, tools: NonEmpty<Vec<Self::ToolSchema>>) -> Self;
    fn with_system_prompt(self, system_prompt: Self::SystemPrompt) -> Self;

    /// Resolve any unmatched tool calls and convert the request's
    /// accumulated conversation into domain messages.
    fn into_messages(self) -> Vec<ChatMessage>;
}

/// Converts a domain [`ChatCompletionRequest`] into a provider-specific request.
pub trait FromDomainRequest {
    fn from_domain_request(request: ai::types::ChatCompletionRequest) -> Self;
}
