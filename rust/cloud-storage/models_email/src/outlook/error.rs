//! Error type for the Microsoft Graph (Outlook) client.
//!
//! Mirrors [`crate::gmail::error::GmailError`] so that call sites in the email
//! service can map provider errors to HTTP status codes uniformly across
//! providers.

use thiserror::Error;

/// Errors returned by the Outlook (Microsoft Graph) client.
#[derive(Error, Debug)]
pub enum OutlookError {
    /// Graph throttling: HTTP 429. Honour the `Retry-After` header when retrying.
    #[error("API Rate Limit Exceeded (429)")]
    RateLimitExceeded,

    /// The access token is invalid or expired: HTTP 401.
    #[error("Unauthorized: The access token is invalid or expired (401)")]
    Unauthorized,

    /// The token lacks the required Graph scope/permission: HTTP 403.
    #[error("Forbidden: Insufficient permissions (403)")]
    Forbidden,

    /// Graph returned a 5xx.
    #[error("Server Error ({0}): {1}")]
    ServerError(u16, String),

    /// The underlying HTTP request could not be sent.
    #[error("HTTP Request Error: {0}")]
    HttpRequest(String),

    /// Graph returned a non-success status we don't special-case.
    #[error("API Error: {0}")]
    ApiError(String),

    /// Failed to read or decode the response body.
    #[error("Failed to read response body: {0}")]
    BodyReadError(String),

    /// The requested resource was a duplicate / already exists: HTTP 409.
    #[error("Conflict: {0}")]
    Conflict(String),

    /// The requested resource does not exist: HTTP 404.
    #[error("Not found: {0}")]
    NotFound(String),

    /// Catch-all internal error.
    #[error("Internal Error: {0}")]
    GenericError(String),
}

impl OutlookError {
    /// Map a non-success HTTP status plus body into the appropriate variant.
    pub fn from_status(status: u16, body: String) -> Self {
        match status {
            401 => OutlookError::Unauthorized,
            403 => OutlookError::Forbidden,
            404 => OutlookError::NotFound(body),
            409 => OutlookError::Conflict(body),
            429 => OutlookError::RateLimitExceeded,
            s if s >= 500 => OutlookError::ServerError(s, body),
            s => OutlookError::ApiError(format!("Graph API error {s}: {body}")),
        }
    }
}
