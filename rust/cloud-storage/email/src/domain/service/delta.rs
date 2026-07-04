use chrono::{DateTime, Utc};
use frecency::domain::ports::FrecencyQueryService;
use models_pagination::{PaginateOn, PaginatedCursor, Query, SimpleSortMethod};
use uuid::Uuid;

use crate::domain::{
    models::{EmailErr, ThreadDeltaDigest, ThreadDeltaQuery},
    ports::EmailRepo,
};

use super::EmailServiceImpl;

/// Smallest allowed page size for the delta feed.
const MIN_PAGE: u32 = 20;
/// Largest allowed page size for the delta feed. Digests are tiny (three
/// fields), so pages can be larger than content endpoints allow.
const MAX_PAGE: u32 = 500;
/// Page size when the caller does not specify one.
const DEFAULT_PAGE: u32 = 200;
/// Oldest change horizon a caller may request. Anything older is not useful
/// for a cache-warm feed and would let a client walk unbounded history.
const MAX_SINCE_AGE_DAYS: i64 = 90;

impl<T, U, E, CS> EmailServiceImpl<T, U, E, CS>
where
    T: EmailRepo,
    U: FrecencyQueryService,
    E: crate::domain::ports::EmailMessageEnqueuer,
    CS: crm::domain::service::CrmService,
    anyhow::Error: From<T::Err>,
{
    #[tracing::instrument(err, skip(self, link_ids, query), fields(links = link_ids.len()))]
    pub(super) async fn get_thread_delta_impl(
        &self,
        link_ids: Vec<Uuid>,
        since: DateTime<Utc>,
        limit: Option<u32>,
        descending: bool,
        query: Query<Uuid, SimpleSortMethod, ()>,
    ) -> Result<PaginatedCursor<ThreadDeltaDigest, Uuid, SimpleSortMethod, ()>, EmailErr> {
        let limit = limit.unwrap_or(DEFAULT_PAGE).clamp(MIN_PAGE, MAX_PAGE);
        let since = since.max(chrono::Utc::now() - chrono::Duration::days(MAX_SINCE_AGE_DAYS));
        let sort_method = *query.sort_method();

        let digests = self
            .email_repo
            .thread_delta(&ThreadDeltaQuery {
                link_ids,
                query,
                since,
                descending,
                limit,
            })
            .await
            .map_err(|e| EmailErr::RepoErr(e.into()))?;

        Ok(digests
            .into_iter()
            .paginate_on(limit as usize, sort_method)
            .into_page())
    }
}
