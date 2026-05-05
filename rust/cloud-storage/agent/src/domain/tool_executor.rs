use super::provider::{ProviderToolCall, ToolOutput};
use ai_toolset::{RequestContext, ToolSet};
use non_empty::NonEmpty;

// TODO: yield tool calls as they finish
pub async fn concurrent_executor<'a, Ctx, ToolCall>(
    context: Ctx,
    request_context: RequestContext,
    toolset: &(dyn ToolSet<Ctx> + Send + Sync),
    calls: &'a NonEmpty<Vec<ToolCall>>,
) -> NonEmpty<Vec<ToolOutput<'a, ToolCall>>>
where
    ToolCall: ProviderToolCall,
    Ctx: Clone + Send + Sync + 'static,
{
    let futures: Vec<_> = calls
        .iter()
        .map(|call| {
            let request_context = request_context.clone();
            async {
                let result = match toolset
                    .try_tool_call(
                        context.clone(),
                        request_context,
                        call.name(),
                        call.arguments(),
                    )
                    .await
                {
                    Ok(Ok(value)) => value,
                    Ok(Err(tool_err)) => serde_json::json!({ "error": tool_err.description }),
                    Err(toolset_err) => serde_json::json!({ "error": toolset_err.to_string() }),
                };
                ToolOutput { call, result }
            }
        })
        .collect();
    let results = futures::future::join_all(futures).await;
    NonEmpty::new(results).expect("outputs mirrors non-empty tool_calls")
}
