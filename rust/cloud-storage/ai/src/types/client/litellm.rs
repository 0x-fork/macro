use crate::tool::types::StreamPart;
use crate::types::client::traits::ExtendedClient;
use crate::types::{AiError, ExtendedOpenAIStream, ExtendedOpenAIStreamItem};

use async_openai::config::Config;
use async_openai::types::{CreateChatCompletionRequest, CreateChatCompletionStreamResponse};
use async_openai::Client as OpenAiClient;
use futures::StreamExt;
use lazy_static::lazy_static;
use macro_env_var::env_var;
use reqwest::header::HeaderMap;
use secrecy::SecretString;

env_var! { pub struct LitellmBaseUrl; }

lazy_static! {
    static ref LITELLM_CONFIG: LiteLlmConfig = LiteLlmConfig::from_env();
}

/// Configuration for connecting to a LiteLLM proxy.
/// Security is handled at the network layer (private ALB + security groups).
#[derive(Clone, Debug)]
pub struct LiteLlmConfig {
    base_url: String,
}

impl LiteLlmConfig {
    fn from_env() -> Self {
        let base_url = LitellmBaseUrl::unwrap_new();
        Self {
            base_url: base_url.as_ref().to_owned(),
        }
    }
}

impl Config for LiteLlmConfig {
    fn api_base(&self) -> &str {
        &self.base_url
    }

    fn api_key(&self) -> &SecretString {
        // Not used — network-layer security only
        static EMPTY: std::sync::LazyLock<SecretString> =
            std::sync::LazyLock::new(|| SecretString::from(String::new()));
        &EMPTY
    }

    fn headers(&self) -> HeaderMap {
        HeaderMap::new()
    }

    fn query(&self) -> Vec<(&str, &str)> {
        vec![]
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }
}

/// Client for LiteLLM, an OpenAI-compatible proxy.
#[derive(Clone)]
pub struct LiteLlmClient {
    inner: OpenAiClient<LiteLlmConfig>,
}

impl LiteLlmClient {
    /// Creates a new LiteLLM client from environment variables.
    pub fn new() -> Self {
        LiteLlmClient {
            inner: OpenAiClient::with_config(LITELLM_CONFIG.clone()),
        }
    }
}

impl Default for LiteLlmClient {
    fn default() -> Self {
        Self::new()
    }
}

impl std::ops::Deref for LiteLlmClient {
    type Target = OpenAiClient<LiteLlmConfig>;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl ExtendedClient for LiteLlmClient {
    type ResponseExtension = ();

    async fn chat_stream(
        &self,
        mut request: CreateChatCompletionRequest,
    ) -> anyhow::Result<ExtendedOpenAIStream<Self::ResponseExtension>, AiError> {
        request.stream = Some(true);
        self.inner
            .chat()
            .create_stream_byot::<_, CreateChatCompletionStreamResponse>(request)
            .await
            .map(|stream| {
                Box::pin(
                    stream.map(|item_result| item_result.map(ExtendedOpenAIStreamItem::Response)),
                ) as _
            })
            .map_err(AiError::from)
    }

    fn handle_extension_item(&self, _: Self::ResponseExtension) -> Option<StreamPart> {
        None
    }
}
