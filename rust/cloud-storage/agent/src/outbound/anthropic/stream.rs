use super::response::AnthropicResponse;
use crate::domain::provider::ProviderStream;
use ai::tool::types::StreamPart;
use ai::types::AiError;
use anthropic::prelude::chat::MessageCompletionResponseStream;
use anthropic::prelude::{ContentDeltaEvent, StreamError, StreamEvent, ToolUse};
use futures::Stream;
use std::collections::HashMap;
use std::pin::Pin;
use std::task::{Context, Poll};

struct PartialToolCall {
    id: String,
    name: String,
    json: String,
}

pub struct AnthropicStream {
    inner: MessageCompletionResponseStream,
    partial_tool_calls: HashMap<u32, PartialToolCall>,
    response: AnthropicResponse,
}

impl AnthropicStream {
    pub fn new(inner: MessageCompletionResponseStream) -> Self {
        Self {
            inner,
            partial_tool_calls: HashMap::new(),
            response: AnthropicResponse::default(),
        }
    }

    fn process_event(&mut self, event: StreamEvent) -> Option<Result<StreamPart, AiError>> {
        match event {
            StreamEvent::Ping | StreamEvent::MessageStop => None,

            StreamEvent::MessageStart { message } => {
                if let Some(usage) = message.usage {
                    self.response.usage = Some(usage);
                }
                None
            }

            StreamEvent::ContentBlockStart {
                index,
                content_block,
            } => match content_block {
                ContentDeltaEvent::ToolUse { id, name, .. } => {
                    self.partial_tool_calls.insert(
                        index,
                        PartialToolCall {
                            id,
                            name,
                            json: String::new(),
                        },
                    );
                    None
                }
                ContentDeltaEvent::StartTextDelta { text }
                | ContentDeltaEvent::TextDelta { text } => {
                    if text.is_empty() {
                        return None;
                    }
                    self.response.text.push_str(&text);
                    Some(Ok(StreamPart::Content(text)))
                }
                _ => None,
            },

            StreamEvent::ContentBlockDelta { index, delta } => match delta {
                ContentDeltaEvent::TextDelta { text }
                | ContentDeltaEvent::StartTextDelta { text } => {
                    self.response.text.push_str(&text);
                    Some(Ok(StreamPart::Content(text)))
                }
                ContentDeltaEvent::InputJsonDelta { partial_json } => {
                    if let Some(partial) = self.partial_tool_calls.get_mut(&index) {
                        partial.json.push_str(&partial_json);
                    }
                    None
                }
                _ => None,
            },

            StreamEvent::ContentBlockStop { index } => {
                let partial = self.partial_tool_calls.remove(&index)?;
                match serde_json::from_str::<serde_json::Value>(&partial.json) {
                    Ok(input) => {
                        self.response.tool_calls.push(ToolUse {
                            id: partial.id.clone(),
                            name: partial.name.clone(),
                            input: input.clone(),
                        });
                        Some(Ok(StreamPart::ToolCall(ai::tool::types::ToolCall {
                            id: partial.id,
                            name: partial.name,
                            json: input,
                        })))
                    }
                    Err(e) => {
                        tracing::error!(error=?e, "failed to parse tool call JSON");
                        None
                    }
                }
            }

            StreamEvent::MessageDelta { delta, usage: _ } => {
                if let Some(stop_reason) = delta.stop_reason {
                    self.response.stop_reason = Some(stop_reason);
                }
                None
            }

            StreamEvent::Error { error } => {
                let msg = match error {
                    StreamError::OverloadedError { message } => message,
                    StreamError::OtherError { message } => message,
                };
                Some(Err(AiError::Generic(anyhow::anyhow!(msg))))
            }
        }
    }
}

impl Stream for AnthropicStream {
    type Item = Result<StreamPart, AiError>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        loop {
            match this.inner.as_mut().poll_next(cx) {
                Poll::Ready(Some(Ok(event))) => match this.process_event(event) {
                    Some(item) => return Poll::Ready(Some(item)),
                    None => continue,
                },
                Poll::Ready(Some(Err(e))) => {
                    return Poll::Ready(Some(Err(AiError::Generic(anyhow::Error::from(e)))));
                }
                Poll::Ready(None) => return Poll::Ready(None),
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

impl ProviderStream for AnthropicStream {
    type Response = AnthropicResponse;

    fn finalize(self) -> AnthropicResponse {
        self.response
    }
}
