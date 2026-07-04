use chrono::{DateTime, Utc};
use doppleganger::{Doppleganger, Mirror};
use models_pagination::PaginatedOpaqueCursor;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::domain::models::ThreadDeltaDigest;

/// Feed direction for the thread delta feed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ApiDeltaOrder {
    /// Oldest change first — the steady-state sync order (resumable).
    Asc,
    /// Newest change first — for bootstrap ("the N most recently changed
    /// threads" in one page).
    Desc,
}

/// Query params for the thread delta feed. Deliberately not a registered
/// component schema: `IntoParams` expands it into inline query parameters,
/// and a component named after it would collide with the params type orval
/// synthesizes for the operation.
#[derive(Debug, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct GetThreadDeltaParams {
    /// Change horizon: return digests for threads whose content changed at or
    /// after this instant. Clamped server-side to a 90-day maximum age.
    pub since: DateTime<Utc>,
    /// Max digests per page. Defaults to 200, clamped to [20, 500].
    pub limit: Option<u32>,
    /// Feed direction; defaults to asc. Pass the same value on every page of
    /// one pagination — the cursor does not carry it.
    pub order: Option<ApiDeltaOrder>,
}

/// A minimal "this thread changed" record. The watermark is the greatest
/// `updated_at` across the thread row and its messages — compare it against a
/// locally cached watermark to decide whether content must be re-fetched.
#[derive(Debug, Serialize, Deserialize, ToSchema, Doppleganger)]
#[dg(backward = ThreadDeltaDigest)]
pub struct ApiThreadDigest {
    pub thread_id: Uuid,
    pub link_id: Uuid,
    pub watermark: DateTime<Utc>,
}

/// One page of the thread delta feed, ordered by `(watermark, thread_id)`
/// ascending.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ApiThreadDelta {
    pub items: Vec<ApiThreadDigest>,
    /// Opaque cursor for the next page; absent when this page is the last.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

impl ApiThreadDelta {
    pub(crate) fn new(model: PaginatedOpaqueCursor<ThreadDeltaDigest>) -> Self {
        Self {
            items: model
                .items
                .into_iter()
                .map(ApiThreadDigest::mirror)
                .collect(),
            next_cursor: model.next_cursor,
        }
    }
}
