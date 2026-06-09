//! Port traits separating the domain from infrastructure.

use crate::domain::models::{CalendarEvent, CreateEventRequest, UpdateEventRequest};
use rootcause::Report;

/// Persistence boundary for calendar events and their attendees.
pub trait CalendarRepository: Send + Sync + 'static {
    /// Lists a user's events whose span intersects `[start_ms, end_ms)`.
    fn list_events(
        &self,
        user_id: &str,
        start_ms: i64,
        end_ms: i64,
    ) -> impl Future<Output = Result<Vec<CalendarEvent>, Report>> + Send;

    /// Fetches a single event owned by `user_id`.
    fn get_event(
        &self,
        user_id: &str,
        event_id: &str,
    ) -> impl Future<Output = Result<Option<CalendarEvent>, Report>> + Send;

    /// Creates an event for `user_id` and returns the persisted record.
    fn create_event(
        &self,
        user_id: &str,
        request: CreateEventRequest,
    ) -> impl Future<Output = Result<CalendarEvent, Report>> + Send;

    /// Updates an event owned by `user_id`. Returns `None` when not found.
    fn update_event(
        &self,
        user_id: &str,
        event_id: &str,
        request: UpdateEventRequest,
    ) -> impl Future<Output = Result<Option<CalendarEvent>, Report>> + Send;

    /// Deletes an event owned by `user_id`. Returns whether a row was removed.
    fn delete_event(
        &self,
        user_id: &str,
        event_id: &str,
    ) -> impl Future<Output = Result<bool, Report>> + Send;

    /// Marks the given attendee emails as invited (adding any new ones), then
    /// returns the refreshed event. Returns `None` when the event is missing.
    fn mark_invited(
        &self,
        user_id: &str,
        event_id: &str,
        emails: Vec<String>,
    ) -> impl Future<Output = Result<Option<CalendarEvent>, Report>> + Send;
}

/// Business-logic boundary consumed by the HTTP layer.
pub trait CalendarService: Send + Sync + 'static {
    /// Lists events intersecting the window.
    fn list_events(
        &self,
        user_id: &str,
        start_ms: i64,
        end_ms: i64,
    ) -> impl Future<Output = Result<Vec<CalendarEvent>, Report>> + Send;

    /// Fetches a single event.
    fn get_event(
        &self,
        user_id: &str,
        event_id: &str,
    ) -> impl Future<Output = Result<Option<CalendarEvent>, Report>> + Send;

    /// Creates an event.
    fn create_event(
        &self,
        user_id: &str,
        request: CreateEventRequest,
    ) -> impl Future<Output = Result<CalendarEvent, Report>> + Send;

    /// Updates an event.
    fn update_event(
        &self,
        user_id: &str,
        event_id: &str,
        request: UpdateEventRequest,
    ) -> impl Future<Output = Result<Option<CalendarEvent>, Report>> + Send;

    /// Deletes an event.
    fn delete_event(
        &self,
        user_id: &str,
        event_id: &str,
    ) -> impl Future<Output = Result<bool, Report>> + Send;

    /// Records that attendees were invited.
    fn mark_invited(
        &self,
        user_id: &str,
        event_id: &str,
        emails: Vec<String>,
    ) -> impl Future<Output = Result<Option<CalendarEvent>, Report>> + Send;
}
