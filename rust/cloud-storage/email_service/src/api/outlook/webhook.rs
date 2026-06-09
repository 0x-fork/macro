//! Webhook that Microsoft Graph hits when an Outlook user's inbox changes.
//!
//! This is the Outlook analogue of [`crate::api::gmail::webhook`]. Two request
//! shapes arrive at this endpoint:
//!
//! 1. **Validation handshake** — when a subscription is created Graph issues a
//!    request carrying a `validationToken` query parameter. We must echo it back
//!    verbatim as `text/plain` with a 2xx within 10 seconds, otherwise the
//!    subscription is rejected.
//! 2. **Change notifications** — a JSON batch of changes. We verify each
//!    notification's `clientState` against our secret (the analogue of verifying
//!    Gmail's Google-signed JWT) and then enqueue a delta-sync job.
//!
//! Reference: <https://learn.microsoft.com/en-us/graph/change-notifications-overview>

use crate::api::context::ApiContext;
use axum::extract::{Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Json, Response};
use model::response::ErrorResponse;
use models_email::outlook::subscription::ChangeNotificationCollection;
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Debug, Deserialize)]
pub struct WebhookQuery {
    /// Present only on the subscription validation handshake.
    #[serde(rename = "validationToken")]
    validation_token: Option<String>,
}

/// Handles both the Graph validation handshake and change notifications.
pub async fn webhook_handler(
    State(ctx): State<ApiContext>,
    Query(query): Query<WebhookQuery>,
    body: String,
) -> Result<Response, Response> {
    // 1. Validation handshake: echo the token back as text/plain.
    if let Some(token) = query.validation_token {
        tracing::info!("responding to outlook subscription validation handshake");
        return Ok((
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/plain")],
            token,
        )
            .into_response());
    }

    // 2. Change notification batch.
    let notifications: ChangeNotificationCollection = serde_json::from_str(&body).map_err(|e| {
        tracing::error!(error=?e, "failed to deserialize outlook change notification");
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                message: "invalid change notification payload".into(),
            }),
        )
            .into_response()
    })?;

    // Verify clientState on every notification before acting on any of them.
    // A mismatch means the notification did not originate from a subscription we
    // created, so we reject the whole batch.
    for notification in &notifications.value {
        if !ctx
            .outlook_client
            .verify_client_state(notification.client_state.as_deref())
        {
            tracing::warn!(
                subscription_id = %notification.subscription_id,
                "outlook notification failed clientState verification"
            );
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    message: "invalid client state".into(),
                }),
            )
                .into_response());
        }
    }

    // Coalesce to unique subscriptions: a single delta sync per affected
    // subscription subsumes every individual message change in the batch.
    let subscription_ids: HashSet<&str> = notifications
        .value
        .iter()
        .map(|n| n.subscription_id.as_str())
        .collect();

    for subscription_id in subscription_ids {
        // TODO(outlook): resolve the link for this subscription and enqueue an
        // `InboxSyncOperation::OutlookNotification` onto the inbox-sync queue
        // (reusing `enqueue_gmail_inbox_sync_notification`). The subscription ->
        // link mapping is persisted when the subscription is created during inbox
        // init; that persistence (a small `email_outlook_subscriptions` table +
        // db_client lookups) is the next increment. Until then we log so the
        // ingress and clientState verification can be exercised end-to-end.
        tracing::info!(
            subscription_id = %subscription_id,
            "received verified outlook change notification (delta sync enqueue pending subscription->link persistence)"
        );
    }

    Ok((StatusCode::ACCEPTED, Json(StatusCode::ACCEPTED.as_u16())).into_response())
}
