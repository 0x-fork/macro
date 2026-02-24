use super::chained::Chained;
use super::chat::Chat;
use crate::tool::types::AsyncToolSet;
use crate::types::ExtendedClient;
use crate::types::LiteLlmClient;
use std::sync::Arc;

pub struct ToolLoop<I, T>
where
    I: ExtendedClient + Clone + Send + Sync,
    T: Clone + Send + Sync,
{
    client: I,
    context: T,
    toolset: Arc<AsyncToolSet<T>>,
}

impl<T> ToolLoop<LiteLlmClient, T>
where
    T: Clone + Send + Sync,
{
    pub fn new(toolset: AsyncToolSet<T>, context: T) -> Self {
        let client = LiteLlmClient::new();
        let toolset = Arc::new(toolset);
        Self {
            client,
            context,
            toolset,
        }
    }
}

impl<I, T> ToolLoop<I, T>
where
    I: ExtendedClient + Clone + Send + Sync,
    T: Clone + Send + Sync,
{
    pub fn chat(&self) -> Chat<I, T> {
        Chat::new(
            self.client.clone(),
            self.toolset.clone(),
            self.context.clone(),
        )
    }

    pub fn chained(&self) -> Chained<I, T> {
        Chained::new(
            self.client.clone(),
            self.toolset.clone(),
            self.context.clone(),
        )
    }
}
