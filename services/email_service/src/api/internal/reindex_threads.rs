use std::collections::{HashMap, HashSet};

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use email::domain::events::{
    EmailMacroEvent, ThreadsReindexReason, ThreadsReindexRequestedMetadata,
};
use macro_authorization::{InternalOnly, MacroAuthorizationExtractor};
use macro_user_id::cowlike::CowLike;
use macro_user_id::user_id::MacroUserIdStr;
use model::response::ErrorResponse;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use email_service::pubsub::util::publish_email_event;

use crate::api::context::{ApiContext, AuthorizationService};

#[cfg(test)]
mod test;

/// Thread ids per request. Publishing is fire-and-forget, so a caller with more
/// than this splits the work and sees partial progress between calls.
const MAX_THREAD_IDS: usize = 5000;

/// Thread ids per published event, matching the contacts-sync producer.
const REINDEX_BATCH_SIZE: usize = 50;

#[derive(Debug, Deserialize)]
pub struct ReindexThreadsRequest {
    pub thread_ids: Vec<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct ReindexThreadsResponse {
    /// Threads that resolved to a live link and were published.
    pub threads_requested: usize,
    /// Events published, each covering up to 50 threads.
    pub events_published: usize,
    /// Requested ids with no matching thread row.
    pub unknown_thread_ids: Vec<Uuid>,
}

/// One event's worth of work: a single link, its owner, and up to
/// [`REINDEX_BATCH_SIZE`] of its threads.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct ReindexBatch {
    pub link_id: Uuid,
    pub macro_id: String,
    pub thread_ids: Vec<Uuid>,
}

/// Turn resolved thread rows into publishable batches, plus the requested ids
/// that matched no thread.
///
/// An event carries one link and owner, so threads group by link before they
/// chunk. Duplicate requested ids collapse, since publishing a thread twice
/// only costs a redundant reindex.
pub(super) fn plan_reindex_batches(
    requested: &[Uuid],
    resolved: Vec<(Uuid, Uuid, String)>,
) -> (Vec<ReindexBatch>, Vec<Uuid>) {
    let found: HashSet<Uuid> = resolved.iter().map(|(id, _, _)| *id).collect();

    let mut seen_unknown = HashSet::new();
    let unknown: Vec<Uuid> = requested
        .iter()
        .filter(|id| !found.contains(id) && seen_unknown.insert(**id))
        .copied()
        .collect();

    let mut by_link: HashMap<(Uuid, String), Vec<Uuid>> = HashMap::new();
    let mut seen_thread = HashSet::new();
    for (thread_id, link_id, macro_id) in resolved {
        if !seen_thread.insert(thread_id) {
            continue;
        }
        by_link
            .entry((link_id, macro_id))
            .or_default()
            .push(thread_id);
    }

    let mut batches = Vec::new();
    for ((link_id, macro_id), thread_ids) in by_link {
        for chunk in thread_ids.chunks(REINDEX_BATCH_SIZE) {
            batches.push(ReindexBatch {
                link_id,
                macro_id: macro_id.clone(),
                thread_ids: chunk.to_vec(),
            });
        }
    }

    (batches, unknown)
}

/// Ask search to reindex specific email threads.
///
/// Publishes the same events contact-name sync does, so consumers need no new
/// handling. Intended for repairing threads whose index updates were lost —
/// nothing else re-emits them once the original event is gone.
#[tracing::instrument(skip(ctx, request), fields(thread_count = request.thread_ids.len()))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    _: MacroAuthorizationExtractor<AuthorizationService, InternalOnly>,
    Json(request): Json<ReindexThreadsRequest>,
) -> Result<Response, Response> {
    if request.thread_ids.is_empty() {
        return Err(error_response(
            StatusCode::BAD_REQUEST,
            "thread_ids must not be empty",
        ));
    }
    if request.thread_ids.len() > MAX_THREAD_IDS {
        return Err(error_response(
            StatusCode::BAD_REQUEST,
            &format!("thread_ids exceeds the {MAX_THREAD_IDS} per-request limit"),
        ));
    }

    let resolved =
        email_db_client::threads::get::get_thread_links_by_ids(&ctx.db, &request.thread_ids)
            .await
            .map_err(|e| {
                tracing::error!(error=?e, "unable to resolve threads for reindex");
                error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "unable to resolve threads",
                )
            })?;

    let (batches, unknown_thread_ids) = plan_reindex_batches(&request.thread_ids, resolved);

    let mut threads_requested = 0;
    let mut events_published = 0;
    for batch in batches {
        let owner = match MacroUserIdStr::parse_from_str(&batch.macro_id) {
            Ok(owner) => owner.into_owned(),
            Err(e) => {
                tracing::error!(error=?e, link_id=%batch.link_id, "skipping link with unparseable owner");
                continue;
            }
        };

        threads_requested += batch.thread_ids.len();
        publish_email_event(
            ctx.macro_event_broker.as_ref(),
            &EmailMacroEvent::threads_reindex_requested(ThreadsReindexRequestedMetadata {
                link_id: batch.link_id,
                owner,
                thread_ids: batch.thread_ids,
                reason: ThreadsReindexReason::ManualRepair,
            }),
        );
        events_published += 1;
    }

    tracing::info!(
        threads_requested,
        events_published,
        unknown = unknown_thread_ids.len(),
        "published thread reindex requests"
    );

    Ok((
        StatusCode::ACCEPTED,
        Json(ReindexThreadsResponse {
            threads_requested,
            events_published,
            unknown_thread_ids,
        }),
    )
        .into_response())
}

fn error_response(status: StatusCode, message: &str) -> Response {
    (
        status,
        Json(ErrorResponse {
            message: message.into(),
        }),
    )
        .into_response()
}
