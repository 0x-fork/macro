use thiserror::Error;

#[derive(Debug, Error)]
pub enum AgentError {
    #[error("ToolRouter: {0}")]
    ToolRouter(String),
}

pub type Result<T> = std::result::Result<T, AgentError>;
