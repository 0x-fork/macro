use chrono::{DateTime, Utc};
use models_pagination::{CursorVal, Identify, Query, SimpleSortMethod, SortOn};
use uuid::Uuid;

/// A minimal "something changed" record for one thread, emitted by the delta
/// feed that backs the client-side email content cache.
///
/// The watermark is `email_threads.updated_at`, which is the authoritative
/// content watermark for a thread: every mutation that changes what
/// `GET /email/threads/{thread_id}` returns bumps it in the same statement or
/// transaction (message ingest/delete, draft upserts, label add/remove,
/// read/star flips).
#[derive(Debug, Clone)]
pub struct ThreadDeltaDigest {
    pub thread_id: Uuid,
    pub link_id: Uuid,
    pub watermark: DateTime<Utc>,
}

impl Identify for ThreadDeltaDigest {
    type Id = Uuid;

    fn id(&self) -> Self::Id {
        self.thread_id
    }
}

impl SortOn<SimpleSortMethod> for ThreadDeltaDigest {
    fn sort_on(sort: SimpleSortMethod) -> impl FnMut(&Self) -> CursorVal<SimpleSortMethod> {
        // The delta feed is only ever ordered by its watermark; every sort
        // method maps to it so cursors round-trip regardless of the tag.
        move |v| CursorVal {
            sort_type: sort,
            last_val: v.watermark,
        }
    }
}

/// Query for a page of the thread delta feed.
pub struct ThreadDeltaQuery {
    /// Every inbox the caller can read (own + delegated links).
    pub link_ids: Vec<Uuid>,
    /// Keyset position: `Query::Sort` on the first page, the previous page's
    /// cursor afterwards.
    pub query: Query<Uuid, SimpleSortMethod, ()>,
    /// Change horizon: only threads whose watermark is at or after this
    /// instant are reported (already clamped by the service).
    pub since: DateTime<Utc>,
    /// Feed direction. Ascending is the steady-state sync order (resumable,
    /// oldest change first); descending exists for bootstrap ("the N most
    /// recently changed threads" in one page).
    pub descending: bool,
    /// Max digests per page (already clamped by the service).
    pub limit: u32,
}
