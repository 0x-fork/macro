//! Delegated tools: a reusable pattern for keeping large, slow tool arguments
//! out of the primary agent's generation.
//!
//! A [`DelegatedTool<T>`] wraps any tool `T`. To the **primary** agent it is
//! exposed as a *name-only* tool — `T`'s title and description, but an empty
//! argument schema. The primary agent decides *whether* to call it without
//! paying the (potentially huge) input-token cost of producing `T`'s arguments.
//!
//! When the primary agent calls a delegated tool, [`DelegatedTool::call`] spins
//! up a **secondary, fast** agent whose sole job is to produce the arguments for
//! the real tool `T`. The secondary agent is given:
//!
//! - the full input schema of `T` (so it knows exactly what to emit), and
//! - the primary agent's in-flight assistant response (text, thinking, and tool
//!   calls so far this turn) as context — see [`ai_toolset::AssistantContext`].
//!
//! The secondary agent runs on [`PredefinedModel::Fast`] using
//! [`agent::structured_output::dynamic_structured_completion`], which is the
//! "one tool, must call it" pattern collapsed into a single schema-constrained
//! completion: there is exactly one possible output (a valid `T`), so a tool
//! loop would be wasted round-trips.
//!
//! The resulting arguments are then dispatched through `T::call`, and the
//! produced arguments are returned to the primary agent **as the tool result**.
//! The frontend renders the delegated tool from that result, so the delegation
//! is invisible — it looks exactly as if the primary agent had called `T`
//! directly.
//!
//! The only concrete instance today is `DisplayResults` (Dynamic UI), but the
//! abstraction is fully generic over `T`.

use agent::Message;
use agent::PredefinedModel;
use agent::structured_output::{DynamicSchema, dynamic_structured_completion};
use ai_toolset::{AsyncTool, RequestContext, ServiceContext, ToolCallError, ToolResult};
use async_trait::async_trait;
use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::marker::PhantomData;

use crate::ToolServiceContext;

/// The model the secondary "fast subagent" uses to fill in a delegated tool's
/// arguments. Delegation exists to be cheap and fast, so it always uses the
/// fast tier.
const DELEGATE_MODEL: PredefinedModel = PredefinedModel::Fast;

/// Marker trait for a tool that can be delegated to a fast secondary agent.
///
/// Implemented for any tool that the secondary agent can fully specify from the
/// primary agent's response context. Carries the human-facing instruction shown
/// to the secondary agent describing *how* to call the tool.
pub trait Delegable: JsonSchema + DeserializeOwned + Send + Sync + 'static {
    /// Instructions for the secondary agent describing how to produce this
    /// tool's arguments from the provided context. Lives in the `prompt` crate.
    fn delegate_instructions() -> &'static str;
}

/// Wraps a tool `T` so the primary agent sees only its name and description
/// (no arguments). See the [module docs](self) for the full flow.
pub struct DelegatedTool<T> {
    _phantom: PhantomData<fn() -> T>,
}

/// The primary agent calls a delegated tool with no arguments. This is the
/// (empty) deserialization target; any extra fields the model emits are ignored.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

impl<'de, T> Deserialize<'de> for DelegatedTool<T> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        // Accept (and discard) any/empty object the primary agent emits.
        let _ = NoArgs::deserialize(deserializer);
        Ok(DelegatedTool {
            _phantom: PhantomData,
        })
    }
}

impl<T: JsonSchema> JsonSchema for DelegatedTool<T> {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        // Same name as the underlying tool: the primary agent (and the frontend
        // tool registry, keyed by name) see an indistinguishable tool.
        T::schema_name()
    }

    fn json_schema(generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
        // Reuse the underlying tool's title and description so the primary agent
        // knows what the tool is for, but strip the properties: this is a
        // name-only tool that takes no arguments.
        let underlying = T::json_schema(generator);
        let title = underlying
            .get("title")
            .cloned()
            .unwrap_or_else(|| serde_json::Value::String(T::schema_name().into_owned()));
        let description = underlying
            .get("description")
            .cloned()
            .unwrap_or(serde_json::Value::String(String::new()));

        schemars::json_schema!({
            "type": "object",
            "title": title,
            "description": description,
            "properties": {},
            "additionalProperties": false,
        })
    }
}

/// The result the primary agent (and the frontend) receive from a delegated
/// tool: the arguments the secondary agent produced, plus the underlying tool's
/// own output. The frontend renders from `args`; the model reads `result`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct DelegatedToolResponse<O> {
    /// The arguments the secondary agent produced for the underlying tool. The
    /// frontend renders the delegated tool from this exactly as if the primary
    /// agent had supplied them directly.
    pub args: serde_json::Value,
    /// The underlying tool's own output, so the primary agent can continue.
    pub result: O,
}

#[async_trait]
impl<T> AsyncTool<ToolServiceContext> for DelegatedTool<T>
where
    T: Delegable + AsyncTool<ToolServiceContext>,
    T::Output: Serialize + JsonSchema + 'static,
{
    type Output = DelegatedToolResponse<T::Output>;

    #[tracing::instrument(skip_all, err)]
    async fn call(
        &self,
        service_context: ServiceContext<ToolServiceContext>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        // 1. The secondary agent needs the full input schema of the real tool —
        //    the same validated, provider-ready schema the primary agent would
        //    have seen had the tool not been delegated.
        let validated =
            ai_toolset::schema::generate_validated_input_schema::<T>().map_err(|e| {
                ToolCallError {
                    description: "failed to build delegated tool schema".to_string(),
                    internal_error: anyhow::anyhow!("{e:?}"),
                }
            })?;
        let schema_value = serde_json::to_value(&validated.schema).map_err(|e| ToolCallError {
            description: "failed to build delegated tool schema".to_string(),
            internal_error: anyhow::Error::from(e),
        })?;

        // 2. Context for the secondary agent: everything the primary agent has
        //    produced so far in this response. Without it there is nothing to
        //    delegate from, so treat an empty context as an error the primary
        //    agent can recover from.
        let Some(transcript) = request_context.assistant_context.to_transcript() else {
            return Err(ToolCallError {
                description: "nothing to display yet; produce the results first, \
                              then call this tool"
                    .to_string(),
                internal_error: anyhow::anyhow!("empty assistant context for delegated tool"),
            });
        };

        // 3. Run the fast secondary agent. It has exactly one job — emit valid
        //    arguments for `T` — so a schema-constrained completion is the
        //    "one tool, must call it" pattern without the tool-loop overhead.
        let args = dynamic_structured_completion(
            DELEGATE_MODEL.api_id(),
            T::delegate_instructions(),
            vec![Message::user(transcript)],
            DynamicSchema {
                name: T::schema_name().into_owned(),
                description: None,
                schema: schema_value,
            },
            service_context.recorder.as_ref(),
            service_context.usage_context.clone(),
        )
        .await
        .map_err(|e| ToolCallError {
            description: "the display subagent failed to produce a view".to_string(),
            internal_error: e,
        })?;

        // 4. Dispatch the real tool with the secondary agent's arguments.
        let tool: T = serde_json::from_value(args.clone()).map_err(|e| ToolCallError {
            description: "the display subagent produced invalid arguments".to_string(),
            internal_error: anyhow::Error::from(e),
        })?;
        let result = tool.call(service_context, request_context).await?;

        Ok(DelegatedToolResponse { args, result })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ai_toolset::schema::generate_validated_input_schema;

    /// A tool with a real argument, used to verify delegation strips it.
    #[derive(serde::Deserialize, JsonSchema)]
    #[schemars(title = "Sample", description = "A sample tool with arguments.")]
    #[allow(dead_code)]
    struct Sample {
        /// A field the delegated wrapper must hide from the primary agent.
        field: String,
    }

    #[test]
    fn delegated_tool_keeps_name_and_description() {
        let validated =
            generate_validated_input_schema::<DelegatedTool<Sample>>().expect("valid schema");
        assert_eq!(validated.name, "Sample");
        assert_eq!(validated.description, "A sample tool with arguments.");
    }

    #[test]
    fn delegated_tool_exposes_no_arguments() {
        let validated =
            generate_validated_input_schema::<DelegatedTool<Sample>>().expect("valid schema");
        let schema = serde_json::to_value(&validated.schema).expect("serialize");
        // The primary agent must see a name-only tool: an object with no
        // properties (the real `field` is hidden behind delegation).
        let props = schema
            .get("properties")
            .and_then(|p| p.as_object())
            .expect("properties present");
        assert!(props.is_empty(), "delegated tool must expose no arguments");
    }

    #[test]
    fn delegated_tool_accepts_empty_args() {
        // The primary agent calls the tool with `{}`; deserialization succeeds.
        serde_json::from_value::<DelegatedTool<Sample>>(serde_json::json!({}))
            .expect("empty object deserializes");
    }
}
