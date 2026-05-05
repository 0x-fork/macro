use super::response::AnthropicResponse;
use crate::domain::provider::{FromDomainRequest, ProviderRequest, ToolOutput};
use ai::types::{
    AssistantMessagePart, ChatCompletionRequest, ChatMessage, ChatMessageContent, Role,
};
use anthropic::prelude::{
    ClientTool, CreateMessageRequestBody, RequestContent, RequestContentKind, RequestMessage,
    Role as AnthropicRole, SystemPrompt, Tool, ToolUse,
};
use non_empty::NonEmpty;
use std::collections::{HashMap, HashSet};

/// Newtype wrapper to satisfy orphan rules for `From<RequestSchema>`.
pub struct AnthropicTool(pub Tool);

const DEFAULT_MAX_TOKENS: u32 = 16384;

pub struct AnthropicRequest {
    pub body: CreateMessageRequestBody,
    initial_message_count: usize,
}

impl FromDomainRequest for AnthropicRequest {
    fn from_domain_request(request: ChatCompletionRequest) -> Self {
        let model_id = request.model().to_string();
        let system = SystemPrompt::Text(request.system_prompt().instructions.clone());

        let anthropic_messages: Vec<RequestMessage> = request
            .messages()
            .iter()
            .flat_map(|msg| {
                let role = match msg.role {
                    Role::User | Role::System => AnthropicRole::User,
                    Role::Assistant => AnthropicRole::Assistant,
                };

                match &msg.content {
                    ChatMessageContent::Text(text) => {
                        vec![RequestMessage {
                            role,
                            content: RequestContent::Text(text.clone()),
                        }]
                    }
                    ChatMessageContent::AssistantMessageParts(parts) => {
                        convert_parts_to_request_messages(parts)
                    }
                }
            })
            .collect();

        let initial_message_count = anthropic_messages.len();

        let body = CreateMessageRequestBody {
            model: model_id,
            messages: anthropic_messages,
            max_tokens: DEFAULT_MAX_TOKENS,
            system: Some(system),
            ..Default::default()
        };

        Self {
            body,
            initial_message_count,
        }
    }
}

fn convert_parts_to_request_messages(parts: &[AssistantMessagePart]) -> Vec<RequestMessage> {
    let mut messages = Vec::new();
    let mut assistant_blocks: Vec<RequestContentKind> = Vec::new();
    let mut tool_results: Vec<RequestContentKind> = Vec::new();

    for part in parts {
        match part {
            AssistantMessagePart::Text { text } => {
                flush_tool_results(&mut messages, &mut tool_results);
                assistant_blocks.push(RequestContentKind::Text {
                    text: text.clone(),
                    cache_control: None,
                    citations: vec![],
                });
            }
            AssistantMessagePart::ToolCall { name, json, id } => {
                flush_tool_results(&mut messages, &mut tool_results);
                assistant_blocks.push(RequestContentKind::ToolUse {
                    id: id.clone(),
                    input: json.clone(),
                    name: name.clone(),
                    cache_control: None,
                });
            }
            AssistantMessagePart::ToolCallResponseJson { id, json, .. } => {
                flush_assistant_blocks(&mut messages, &mut assistant_blocks);
                tool_results.push(RequestContentKind::ToolResult {
                    tool_use_id: id.clone(),
                    content: serde_json::to_string_pretty(json)
                        .unwrap_or_else(|_| "internal error formatting response".into()),
                    cache_control: None,
                    is_err: None,
                });
            }
            AssistantMessagePart::ToolCallErr {
                id, description, ..
            } => {
                flush_assistant_blocks(&mut messages, &mut assistant_blocks);
                tool_results.push(RequestContentKind::ToolResult {
                    tool_use_id: id.clone(),
                    content: description.clone(),
                    cache_control: None,
                    is_err: Some(true),
                });
            }
        }
    }

    flush_assistant_blocks(&mut messages, &mut assistant_blocks);
    flush_tool_results(&mut messages, &mut tool_results);
    messages
}

fn flush_assistant_blocks(
    messages: &mut Vec<RequestMessage>,
    blocks: &mut Vec<RequestContentKind>,
) {
    if !blocks.is_empty() {
        messages.push(RequestMessage {
            role: AnthropicRole::Assistant,
            content: RequestContent::Blocks(std::mem::take(blocks)),
        });
    }
}

fn flush_tool_results(messages: &mut Vec<RequestMessage>, results: &mut Vec<RequestContentKind>) {
    if !results.is_empty() {
        messages.push(RequestMessage {
            role: AnthropicRole::User,
            content: RequestContent::Blocks(std::mem::take(results)),
        });
    }
}

impl From<ai_toolset::RequestSchema> for AnthropicTool {
    fn from(schema: ai_toolset::RequestSchema) -> Self {
        AnthropicTool(Tool::Client(ClientTool {
            name: schema.name,
            description: None,
            input_schema: serde_json::to_value(schema.schema).unwrap_or_default(),
        }))
    }
}

impl ProviderRequest for AnthropicRequest {
    type Response = AnthropicResponse;
    type ToolSchema = AnthropicTool;
    type SystemPrompt = SystemPrompt;

    fn merge_response(mut self, response: AnthropicResponse) -> Self {
        let mut content_blocks = vec![];

        if !response.text.is_empty() {
            content_blocks.push(RequestContentKind::Text {
                text: response.text,
                cache_control: None,
                citations: vec![],
            });
        }

        for tool_call in &response.tool_calls {
            content_blocks.push(RequestContentKind::ToolUse {
                id: tool_call.id.clone(),
                input: tool_call.input.clone(),
                name: tool_call.name.clone(),
                cache_control: None,
            });
        }

        if !content_blocks.is_empty() {
            self.body.messages.push(RequestMessage {
                role: AnthropicRole::Assistant,
                content: RequestContent::Blocks(content_blocks),
            });
        }

        self
    }

    fn merge_tool_outputs<'a>(mut self, outputs: NonEmpty<Vec<ToolOutput<'a, ToolUse>>>) -> Self {
        let tool_results: Vec<RequestContentKind> = outputs
            .into_inner()
            .into_iter()
            .map(|output| RequestContentKind::ToolResult {
                tool_use_id: output.call.id.clone(),
                content: serde_json::to_string_pretty(&output.result)
                    .unwrap_or_else(|_| "internal error formatting response".into()),
                cache_control: None,
                is_err: None,
            })
            .collect();

        self.body.messages.push(RequestMessage {
            role: AnthropicRole::User,
            content: RequestContent::Blocks(tool_results),
        });

        self
    }

    fn with_tools(mut self, tools: NonEmpty<Vec<AnthropicTool>>) -> Self {
        self.body.tools = Some(tools.into_inner().into_iter().map(|t| t.0).collect());
        self
    }

    fn with_system_prompt(mut self, system_prompt: SystemPrompt) -> Self {
        self.body.system = Some(system_prompt);
        self
    }

    fn into_messages(self) -> Vec<ChatMessage> {
        let new_messages = &self.body.messages[self.initial_message_count..];
        if new_messages.is_empty() {
            return vec![];
        }

        // First pass: collect tool_use_id → name and which IDs have responses
        let mut tool_names: HashMap<&str, &str> = HashMap::new();
        let mut responded: HashSet<&str> = HashSet::new();

        for msg in new_messages {
            let blocks = match &msg.content {
                RequestContent::Blocks(blocks) => blocks,
                RequestContent::Text(_) => continue,
            };
            for block in blocks {
                match block {
                    RequestContentKind::ToolUse { id, name, .. } => {
                        tool_names.insert(id, name);
                    }
                    RequestContentKind::ToolResult { tool_use_id, .. } => {
                        responded.insert(tool_use_id);
                    }
                    _ => {}
                }
            }
        }

        // Second pass: convert to domain parts, inserting cancelled errors
        // for any tool call without a matching result
        let mut parts: Vec<AssistantMessagePart> = Vec::new();

        for msg in new_messages {
            match &msg.content {
                RequestContent::Text(text) => {
                    parts.push(AssistantMessagePart::Text { text: text.clone() });
                }
                RequestContent::Blocks(blocks) => {
                    for block in blocks {
                        match block {
                            RequestContentKind::Text { text, .. } => {
                                parts.push(AssistantMessagePart::Text { text: text.clone() });
                            }
                            RequestContentKind::ToolUse {
                                id, input, name, ..
                            } => {
                                parts.push(AssistantMessagePart::ToolCall {
                                    name: name.clone(),
                                    json: input.clone(),
                                    id: id.clone(),
                                });
                                if !responded.contains(id.as_str()) {
                                    parts.push(AssistantMessagePart::ToolCallErr {
                                        name: name.clone(),
                                        id: id.clone(),
                                        description: "cancelled".to_string(),
                                    });
                                }
                            }
                            RequestContentKind::ToolResult {
                                tool_use_id,
                                content,
                                is_err,
                                ..
                            } => {
                                let name = tool_names
                                    .get(tool_use_id.as_str())
                                    .unwrap_or(&"")
                                    .to_string();
                                if *is_err == Some(true) {
                                    parts.push(AssistantMessagePart::ToolCallErr {
                                        name,
                                        description: content.clone(),
                                        id: tool_use_id.clone(),
                                    });
                                } else {
                                    parts.push(AssistantMessagePart::ToolCallResponseJson {
                                        name,
                                        json: serde_json::from_str(content)
                                            .unwrap_or(serde_json::Value::String(content.clone())),
                                        id: tool_use_id.clone(),
                                    });
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        if parts.is_empty() {
            return vec![];
        }

        vec![ChatMessage {
            role: Role::Assistant,
            content: ChatMessageContent::AssistantMessageParts(parts),
            attachments: None,
        }]
    }
}
