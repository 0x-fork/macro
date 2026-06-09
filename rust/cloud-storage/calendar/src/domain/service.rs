//! The calendar domain service: thin business logic over a repository.

use crate::domain::models::{CalendarEvent, CreateEventRequest, UpdateEventRequest};
use crate::domain::ports::{CalendarRepository, CalendarService};
use rootcause::Report;
use tracing::instrument;

/// Domain service backed by a [`CalendarRepository`].
pub struct CalendarDomainService<R> {
    /// Persistence adapter.
    pub repository: R,
}

impl<R: CalendarRepository> CalendarDomainService<R> {
    /// Creates a new service over the given repository.
    pub fn new(repository: R) -> Self {
        Self { repository }
    }
}

/// Ensures `start <= end`, swapping if a client sent them reversed.
fn normalize(mut request: CreateEventRequest) -> CreateEventRequest {
    if request.end_ms < request.start_ms {
        std::mem::swap(&mut request.start_ms, &mut request.end_ms);
    }
    request
}

impl<R: CalendarRepository> CalendarService for CalendarDomainService<R> {
    #[instrument(err, skip(self))]
    async fn list_events(
        &self,
        user_id: &str,
        start_ms: i64,
        end_ms: i64,
    ) -> Result<Vec<CalendarEvent>, Report> {
        self.repository.list_events(user_id, start_ms, end_ms).await
    }

    #[instrument(err, skip(self))]
    async fn get_event(
        &self,
        user_id: &str,
        event_id: &str,
    ) -> Result<Option<CalendarEvent>, Report> {
        self.repository.get_event(user_id, event_id).await
    }

    #[instrument(err, skip(self, request))]
    async fn create_event(
        &self,
        user_id: &str,
        request: CreateEventRequest,
    ) -> Result<CalendarEvent, Report> {
        self.repository.create_event(user_id, normalize(request)).await
    }

    #[instrument(err, skip(self, request))]
    async fn update_event(
        &self,
        user_id: &str,
        event_id: &str,
        request: UpdateEventRequest,
    ) -> Result<Option<CalendarEvent>, Report> {
        self.repository
            .update_event(user_id, event_id, normalize(request))
            .await
    }

    #[instrument(err, skip(self))]
    async fn delete_event(&self, user_id: &str, event_id: &str) -> Result<bool, Report> {
        self.repository.delete_event(user_id, event_id).await
    }

    #[instrument(err, skip(self))]
    async fn mark_invited(
        &self,
        user_id: &str,
        event_id: &str,
        emails: Vec<String>,
    ) -> Result<Option<CalendarEvent>, Report> {
        self.repository.mark_invited(user_id, event_id, emails).await
    }
}
