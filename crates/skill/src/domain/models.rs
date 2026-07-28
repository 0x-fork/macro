//! Domain models for skills.

use thiserror::Error;

/// A skill — a reusable markdown document of AI instructions that can be
/// attached to an AI chat input via a `/<skillname>` slash command and
/// injected into the AI system prompt.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[cfg_attr(feature = "ai_tools", derive(schemars::JsonSchema))]
pub struct Skill {
    /// The skill's document id.
    pub document_id: String,
    /// The skill's display name.
    pub name: String,
}

/// Arguments for creating a new skill document.
#[derive(Debug, Clone)]
pub struct CreateSkillArgs {
    /// The skill's display name.
    pub name: String,
    /// Markdown source text. Defaults to an empty skill document.
    pub markdown: Option<String>,
    /// Optional project ID to associate the skill with.
    pub project_id: Option<uuid::Uuid>,
}

/// Plain-text content resolved from an attached skill, ready to be injected
/// into the AI system prompt.
#[derive(Debug, Clone)]
pub struct ResolvedSkillContent {
    /// The skill's display name, if known.
    pub name: Option<String>,
    /// The resolved plain-text content, or an error description if
    /// resolution failed.
    pub content: String,
}

/// A `Result` alias where the error type is [`SkillError`].
pub type Result<T> = std::result::Result<T, SkillError>;

/// Domain error type for skill operations.
#[derive(Debug, Error)]
pub enum SkillError {
    /// The requested skill was not found.
    #[error("skill not found: {0}")]
    NotFound(String),
    /// A bad request was made.
    #[error("bad request: {0}")]
    BadRequest(String),
    /// An internal error occurred.
    #[error("internal skill error: {0:?}")]
    Internal(rootcause::Report),
}

impl From<rootcause::Report> for SkillError {
    fn from(report: rootcause::Report) -> Self {
        SkillError::Internal(report)
    }
}

#[cfg(feature = "inbound")]
impl axum::response::IntoResponse for SkillError {
    fn into_response(self) -> axum::response::Response {
        use axum::http::StatusCode;

        let (status, msg) = match &self {
            SkillError::NotFound(_) => (StatusCode::NOT_FOUND, "Not found"),
            SkillError::BadRequest(_) => (StatusCode::BAD_REQUEST, "Bad request"),
            SkillError::Internal(_) => {
                tracing::error!(error=?self, "skill handler error");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
        };

        (status, msg.to_string()).into_response()
    }
}
