//! Outlook (Microsoft Graph) change-notification webhook.

use crate::api::context::ApiContext;
use axum::{Router, routing::post};

pub(crate) mod webhook;

/// Router for the Outlook webhook, nested under `/outlook` in the API.
pub fn router() -> Router<ApiContext> {
    Router::new().route("/webhook", post(webhook::webhook_handler))
}
