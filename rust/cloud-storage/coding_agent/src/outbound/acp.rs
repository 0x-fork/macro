//! [`AgentRunner`] that drives Claude Code over the Agent Client Protocol (ACP).
//!
//! macro acts as the ACP *client*: it connects to the `claude-code-acp` process
//! running inside the sandbox (bridged to a WebSocket by the in-sandbox
//! supervisor), opens a session, sends the task as a prompt, and translates the
//! agent's `session/update` notifications into our provider-agnostic
//! [`CodingEvent`] stream. Permission requests are resolved according to the
//! configured [`PermissionPolicy`].
//!
//! The ACP wire types here are intentionally minimal and parsed defensively
//! from JSON so they tolerate protocol revisions; swapping in the official
//! `agent-client-protocol` crate later is a drop-in replacement behind this
//! same [`AgentRunner`] impl.

use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::connect_async;
use tungstenite::Message;

use crate::domain::error::{CodingError, Result};
use crate::domain::models::{
    CodingEvent, CodingOutcome, CodingTask, GitCredentials, PermissionOption, PermissionPolicy,
    PlanEntry, PlanStatus, PrResult, SandboxConnection, StopReason, ToolCallStatus, ToolKind,
};
use crate::domain::ports::{AgentRunner, CodingEventSink};

/// Drives Claude Code (or any ACP agent) inside a sandbox.
pub struct AcpClaudeCodeRunner {
    /// ACP protocol version advertised during `initialize`.
    protocol_version: u32,
}

impl Default for AcpClaudeCodeRunner {
    fn default() -> Self {
        Self {
            protocol_version: 1,
        }
    }
}

impl AcpClaudeCodeRunner {
    /// Construct a runner with the default protocol version.
    pub fn new() -> Self {
        Self::default()
    }
}

#[async_trait]
impl AgentRunner for AcpClaudeCodeRunner {
    fn name(&self) -> &'static str {
        "claude_code"
    }

    #[tracing::instrument(skip(self, task, _creds, sink), fields(branch = %task.work_branch), err)]
    async fn run(
        &self,
        connection: &SandboxConnection,
        task: &CodingTask,
        _creds: &GitCredentials,
        policy: PermissionPolicy,
        sink: CodingEventSink,
    ) -> Result<CodingOutcome> {
        let (ws, _resp) = connect_async(connection.agent_socket_url.as_str())
            .await
            .map_err(|e| CodingError::agent(format!("acp connect failed: {e}")))?;
        let (mut tx, mut rx) = ws.split();

        let mut next_id: i64 = 0;
        let mut new_id = || {
            next_id += 1;
            next_id
        };
        // Populated as notifications stream in (e.g. a PR URL in tool output).
        let mut collector = OutcomeCollector::new(task.work_branch.clone());

        // 1. initialize
        let init_id = new_id();
        send(
            &mut tx,
            &json!({
                "jsonrpc": "2.0",
                "id": init_id,
                "method": "initialize",
                "params": {
                    "protocolVersion": self.protocol_version,
                    "clientCapabilities": { "fs": { "readTextFile": false, "writeTextFile": false } }
                }
            }),
        )
        .await?;
        await_response(&mut rx, init_id, &sink, policy, &mut tx, &mut collector).await?;

        // 2. session/new
        let session_id_req = new_id();
        send(
            &mut tx,
            &json!({
                "jsonrpc": "2.0",
                "id": session_id_req,
                "method": "session/new",
                "params": { "cwd": connection.workdir, "mcpServers": [] }
            }),
        )
        .await?;
        let new_session = await_response(
            &mut rx,
            session_id_req,
            &sink,
            policy,
            &mut tx,
            &mut collector,
        )
        .await?;
        let session_id = new_session
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or("session")
            .to_string();

        // 3. session/prompt with the task + branch/PR instructions.
        let prompt = build_prompt(task);
        let prompt_id = new_id();
        send(
            &mut tx,
            &json!({
                "jsonrpc": "2.0",
                "id": prompt_id,
                "method": "session/prompt",
                "params": {
                    "sessionId": session_id,
                    "prompt": [{ "type": "text", "text": prompt }]
                }
            }),
        )
        .await?;

        // 4. Drain notifications until the prompt turn completes. The
        //    collector observes message/tool text for a PR URL along the way.
        let result =
            await_response(&mut rx, prompt_id, &sink, policy, &mut tx, &mut collector).await;

        let stop_reason = match &result {
            Ok(resp) => map_stop_reason(resp.get("stopReason").and_then(Value::as_str)),
            Err(_) => StopReason::Refusal,
        };
        let summary = result
            .as_ref()
            .ok()
            .and_then(|r| r.get("summary").and_then(Value::as_str).map(String::from))
            .unwrap_or_else(|| match &collector.pr {
                Some(pr) => format!("Opened pull request #{}.", pr.number),
                None => "Coding turn finished.".to_string(),
            });

        let outcome = CodingOutcome {
            stop_reason,
            pr: collector.pr.clone(),
            summary: summary.clone(),
        };
        sink.emit(CodingEvent::Finished {
            stop_reason,
            pr: collector.pr.clone(),
            summary,
        });
        result.map(|_| outcome)
    }
}

/// Tracks side outputs (e.g. a detected PR URL) seen during the stream.
struct OutcomeCollector {
    branch: String,
    pr: Option<PrResult>,
}

impl OutcomeCollector {
    fn new(branch: String) -> Self {
        Self { branch, pr: None }
    }

    /// Capture a PR if a GitHub pull-request URL appears in tool output.
    fn observe_text(&mut self, text: &str) {
        if self.pr.is_some() {
            return;
        }
        if let Some(idx) = text.find("github.com/") {
            let tail = &text[idx..];
            if let Some(pull_idx) = tail.find("/pull/") {
                let number_str: String = tail[pull_idx + 6..]
                    .chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect();
                if let Ok(number) = number_str.parse::<u64>() {
                    let url_end = tail.find(char::is_whitespace).unwrap_or(tail.len());
                    self.pr = Some(PrResult {
                        url: format!("https://{}", &tail[..url_end]),
                        number,
                        branch: self.branch.clone(),
                        title: String::new(),
                        changed_files: None,
                    });
                }
            }
        }
    }
}

fn build_prompt(task: &CodingTask) -> String {
    let base = task.base_branch.as_deref().unwrap_or("the default branch");
    format!(
        "You are working in a cloned git repository. Based off {base}, create and check out a \
         new branch named `{branch}`. Then complete the following task, committing your work:\n\n\
         {prompt}\n\n\
         When finished, push `{branch}` to origin and open a pull request. Report the pull \
         request URL in your final message.",
        branch = task.work_branch,
        prompt = task.prompt,
    )
}

type WsSink = futures_util::stream::SplitSink<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    Message,
>;
type WsStream = futures_util::stream::SplitStream<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
>;

async fn send(tx: &mut WsSink, value: &Value) -> Result<()> {
    tx.send(Message::Text(value.to_string().into()))
        .await
        .map_err(|e| CodingError::agent(format!("acp send failed: {e}")))
}

/// Read messages until the response for `id` arrives, forwarding any
/// `session/update` notifications to `sink` and answering permission requests.
async fn await_response(
    rx: &mut WsStream,
    id: i64,
    sink: &CodingEventSink,
    policy: PermissionPolicy,
    tx: &mut WsSink,
    collector: &mut OutcomeCollector,
) -> Result<Value> {
    while let Some(msg) = rx.next().await {
        let msg = msg.map_err(|e| CodingError::agent(format!("acp recv failed: {e}")))?;
        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Binary(b) => String::from_utf8_lossy(&b).to_string(),
            Message::Close(_) => return Err(CodingError::agent("acp socket closed")),
            _ => continue,
        };
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            continue;
        };

        // A response to our request?
        if value.get("id").and_then(Value::as_i64) == Some(id) && value.get("method").is_none() {
            if let Some(err) = value.get("error") {
                return Err(CodingError::agent(format!("acp error: {err}")));
            }
            return Ok(value.get("result").cloned().unwrap_or(Value::Null));
        }

        process_message(&value, sink, policy, tx, collector).await?;
    }
    Err(CodingError::agent("acp stream ended before response"))
}

/// Handle a notification or server→client request.
async fn process_message(
    value: &Value,
    sink: &CodingEventSink,
    policy: PermissionPolicy,
    tx: &mut WsSink,
    collector: &mut OutcomeCollector,
) -> Result<()> {
    let method = value.get("method").and_then(Value::as_str).unwrap_or("");
    match method {
        "session/update" => {
            if let Some(params) = value.get("params") {
                for event in map_session_update(params) {
                    match &event {
                        CodingEvent::Message { text } => collector.observe_text(text),
                        CodingEvent::ToolUpdate {
                            output: Some(o), ..
                        } => collector.observe_text(o),
                        _ => {}
                    }
                    sink.emit(event);
                }
            }
        }
        "session/request_permission" => {
            let request_id = value.get("id").cloned().unwrap_or(Value::Null);
            let params = value.get("params").cloned().unwrap_or(Value::Null);
            let (option_id, title, options) = choose_permission(&params, policy);
            sink.emit(CodingEvent::PermissionRequest {
                id: request_id.to_string(),
                title,
                options,
            });
            sink.emit(CodingEvent::PermissionResolved {
                id: request_id.to_string(),
                option_id: option_id.clone(),
            });
            send(
                tx,
                &json!({
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": { "outcome": { "outcome": "selected", "optionId": option_id } }
                }),
            )
            .await?;
        }
        _ => {}
    }
    Ok(())
}

/// Map an ACP `session/update` params payload into zero or more events.
fn map_session_update(params: &Value) -> Vec<CodingEvent> {
    let update = params.get("update").unwrap_or(params);
    let kind = update
        .get("sessionUpdate")
        .and_then(Value::as_str)
        .unwrap_or("");
    match kind {
        "agent_message_chunk" => text_of(update)
            .map(|text| vec![CodingEvent::Message { text }])
            .unwrap_or_default(),
        "agent_thought_chunk" => text_of(update)
            .map(|text| vec![CodingEvent::Thought { text }])
            .unwrap_or_default(),
        "tool_call" => {
            let id = update
                .get("toolCallId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let title = update
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Tool call")
                .to_string();
            let kind = map_tool_kind(update.get("kind").and_then(Value::as_str));
            let status = map_tool_status(update.get("status").and_then(Value::as_str));
            let mut events = vec![CodingEvent::ToolCall {
                id,
                title,
                kind,
                status,
            }];
            events.extend(diffs_from_content(update));
            events
        }
        "tool_call_update" => {
            let id = update
                .get("toolCallId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let status = map_tool_status(update.get("status").and_then(Value::as_str));
            let output = update
                .get("content")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|c| c.get("content"))
                .and_then(|c| c.get("text"))
                .and_then(Value::as_str)
                .map(String::from);
            let mut events = vec![CodingEvent::ToolUpdate { id, status, output }];
            events.extend(diffs_from_content(update));
            events
        }
        "plan" => {
            let entries = update
                .get("entries")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .map(|e| PlanEntry {
                            content: e
                                .get("content")
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_string(),
                            status: map_plan_status(e.get("status").and_then(Value::as_str)),
                        })
                        .collect()
                })
                .unwrap_or_default();
            vec![CodingEvent::Plan { entries }]
        }
        _ => Vec::new(),
    }
}

fn diffs_from_content(update: &Value) -> Vec<CodingEvent> {
    let Some(content) = update.get("content").and_then(Value::as_array) else {
        return Vec::new();
    };
    content
        .iter()
        .filter_map(|item| {
            if item.get("type").and_then(Value::as_str) == Some("diff") {
                Some(CodingEvent::Diff {
                    path: item
                        .get("path")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    old_text: item
                        .get("oldText")
                        .and_then(Value::as_str)
                        .map(String::from),
                    new_text: item
                        .get("newText")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                })
            } else {
                None
            }
        })
        .collect()
}

fn text_of(update: &Value) -> Option<String> {
    update
        .get("content")
        .and_then(|c| c.get("text"))
        .and_then(Value::as_str)
        .map(String::from)
}

fn map_tool_kind(kind: Option<&str>) -> ToolKind {
    match kind {
        Some("read") => ToolKind::Read,
        Some("edit") => ToolKind::Edit,
        Some("delete") => ToolKind::Delete,
        Some("move") => ToolKind::Move,
        Some("search") => ToolKind::Search,
        Some("execute") => ToolKind::Execute,
        Some("think") => ToolKind::Think,
        Some("fetch") => ToolKind::Fetch,
        _ => ToolKind::Other,
    }
}

fn map_tool_status(status: Option<&str>) -> ToolCallStatus {
    match status {
        Some("in_progress") => ToolCallStatus::InProgress,
        Some("completed") => ToolCallStatus::Completed,
        Some("failed") => ToolCallStatus::Failed,
        _ => ToolCallStatus::Pending,
    }
}

fn map_plan_status(status: Option<&str>) -> PlanStatus {
    match status {
        Some("in_progress") => PlanStatus::InProgress,
        Some("completed") => PlanStatus::Completed,
        _ => PlanStatus::Pending,
    }
}

fn map_stop_reason(reason: Option<&str>) -> StopReason {
    match reason {
        Some("max_tokens") => StopReason::MaxTokens,
        Some("max_turn_requests") => StopReason::MaxTurnRequests,
        Some("refusal") => StopReason::Refusal,
        Some("cancelled") => StopReason::Cancelled,
        _ => StopReason::EndTurn,
    }
}

/// Pick the permission option to send back, per policy.
fn choose_permission(
    params: &Value,
    policy: PermissionPolicy,
) -> (String, String, Vec<PermissionOption>) {
    let title = params
        .get("toolCall")
        .and_then(|t| t.get("title"))
        .and_then(Value::as_str)
        .or_else(|| params.get("title").and_then(Value::as_str))
        .unwrap_or("Permission requested")
        .to_string();

    let options: Vec<PermissionOption> = params
        .get("options")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|o| {
                    let id = o
                        .get("optionId")
                        .and_then(Value::as_str)
                        .unwrap_or("allow")
                        .to_string();
                    let label = o
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or(&id)
                        .to_string();
                    let allows = o
                        .get("kind")
                        .and_then(Value::as_str)
                        .map(|k| k.starts_with("allow"))
                        .unwrap_or(true);
                    PermissionOption { id, label, allows }
                })
                .collect()
        })
        .unwrap_or_else(|| {
            vec![
                PermissionOption {
                    id: "allow".into(),
                    label: "Allow".into(),
                    allows: true,
                },
                PermissionOption {
                    id: "reject".into(),
                    label: "Reject".into(),
                    allows: false,
                },
            ]
        });

    let want_allow = matches!(
        policy,
        PermissionPolicy::AutoApprove | PermissionPolicy::AutoApproveSafe
    );
    let chosen = options
        .iter()
        .find(|o| o.allows == want_allow)
        .or_else(|| options.first())
        .map(|o| o.id.clone())
        .unwrap_or_else(|| "allow".to_string());

    (chosen, title, options)
}
