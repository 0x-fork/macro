//! Public open-tracking (read receipt) pixel endpoint.
//!
//! Outgoing messages with read receipts enabled embed a 1x1 transparent image
//! pointing at `/t/o/{token}`. Recipient mail clients (or their image proxies)
//! fetch it when the message is opened, and the open is recorded against the
//! sender's copy of the message.
//!
//! The route is unauthenticated by design — it is fetched by arbitrary mail
//! clients — and always returns the pixel, so callers learn nothing about
//! whether a token was valid.

use axum::{
    Router,
    extract::{Path, State},
    http::header,
    response::{IntoResponse, Response},
    routing::get,
};
use uuid::Uuid;

use crate::domain::ports::EmailService;

use super::previews_router::EmailRouterState;

/// A 1x1 transparent GIF (GIF89a with the transparent color flag set).
const TRANSPARENT_PIXEL_GIF: &[u8] = &[
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, 0x01, 0x00, // 1x1
    0x80, 0x00, 0x00, // global color table with 2 entries
    0x00, 0x00, 0x00, // color 0: black
    0xFF, 0xFF, 0xFF, // color 1: white
    0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, // graphic control: transparent index 0
    0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // image descriptor
    0x02, 0x02, 0x44, 0x01, 0x00, // image data
    0x3B, // trailer
];

pub fn router<S, T>(state: EmailRouterState<T>) -> Router<S>
where
    S: Send + Sync + 'static,
    T: EmailService,
{
    Router::new()
        .route("/o/{token}", get(open_pixel_handler::<T>))
        .with_state(state)
}

// `token` is intentionally excluded from the span: it is a per-message secret
// and would be high-cardinality telemetry.
#[tracing::instrument(skip_all)]
async fn open_pixel_handler<T: EmailService>(
    State(service): State<EmailRouterState<T>>,
    Path(token): Path<String>,
) -> Response {
    if let Ok(token) = Uuid::parse_str(token.trim()) {
        match service.service().record_message_open(token).await {
            Ok(Some(open)) => {
                tracing::debug!(
                    message_id = %open.message_id,
                    link_id = %open.link_id,
                    open_count = open.open_count,
                    "Recorded email open"
                );
            }
            Ok(None) => {}
            Err(e) => {
                tracing::error!(error = ?e, "Failed to record email open");
            }
        }
    }

    (
        [
            (header::CONTENT_TYPE, "image/gif"),
            // Repeat opens must re-fetch the pixel rather than hit a cache.
            (
                header::CACHE_CONTROL,
                "no-cache, no-store, must-revalidate, max-age=0",
            ),
            (header::PRAGMA, "no-cache"),
        ],
        TRANSPARENT_PIXEL_GIF,
    )
        .into_response()
}
