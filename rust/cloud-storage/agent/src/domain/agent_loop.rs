use super::provider::{
    AiProvider, FromDomainRequest, ProviderRequest, ProviderResponse, ProviderStream,
};
use super::tool_executor::concurrent_executor;
use ai::types::{ChatCompletionRequest, ChatMessage};
use ai_toolset::{RequestContext, ToolSet};
use async_stream::try_stream;
use futures::{Stream, StreamExt};
use non_empty::NonEmpty;
use std::sync::Arc;

const MAX_RECURSIONS: usize = 100;

/// Generic agent loop that drives multi-turn tool-use conversations
/// with any [`AiProvider`].
pub struct AgentLoop<P, Ctx>
where
    P: AiProvider,
{
    provider: P,
    toolset: Arc<dyn ToolSet<Ctx> + Send + Sync>,
    context: Ctx,
    request: Option<P::Request>,
}

impl<P, Ctx> AgentLoop<P, Ctx>
where
    P: AiProvider,
{
    pub fn new(provider: P, toolset: Arc<dyn ToolSet<Ctx> + Send + Sync>, context: Ctx) -> Self {
        Self {
            provider,
            toolset,
            context,
            request: None,
        }
    }

    /// Resolve any unmatched tool calls and return the accumulated
    /// conversation as domain messages.
    pub fn into_messages(self) -> Vec<ChatMessage> {
        match self.request {
            Some(request) => request.into_messages(),
            None => vec![],
        }
    }
}

impl<P, Ctx> AgentLoop<P, Ctx>
where
    P: AiProvider,
    <P::Request as ProviderRequest>::ToolSchema: From<ai_toolset::RequestSchema> + Send,
    Ctx: Clone + Send + Sync + 'static,
{
    pub fn send_message(
        &mut self,
        request: ChatCompletionRequest,
        request_context: RequestContext,
    ) -> impl Stream<Item = Result<P::StreamItem, P::Error>> + Send + '_ {
        self.request = Some(P::Request::from_domain_request(request));
        try_stream! {
            for _ in 0..MAX_RECURSIONS {
                let tools: Vec<<P::Request as ProviderRequest>::ToolSchema> = self
                    .toolset
                    .request_schemas()
                    .unwrap_or_default()
                    .into_iter()
                    .map(Into::into)
                    .collect();

                if let Ok(tools) = NonEmpty::new(tools) {
                    let req = self.request.take().unwrap();
                    self.request = Some(req.with_tools(tools));
                }

                let mut provider_stream = self.provider.send_request(
                    self.request.as_ref().unwrap()
                ).await?;

                while let Some(item) = provider_stream.next().await {
                    yield item?;
                }

                let response = provider_stream.finalize();

                let Some(tool_calls) = response.tool_calls() else {
                    let req = self.request.take().unwrap();
                    self.request = Some(req.merge_response(response));
                    break;
                };

                let tool_outputs = concurrent_executor(
                    self.context.clone(),
                    request_context.clone(),
                    &*self.toolset,
                    &tool_calls
                ).await;

                for output in tool_outputs.iter() {
                    yield P::StreamItem::from(output);
                }

                let req = self.request.take().unwrap();
                self.request = Some(
                    req.merge_response(response)
                       .merge_tool_outputs(tool_outputs)
                );
            }
        }
    }
}
