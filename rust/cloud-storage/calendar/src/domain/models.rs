//! Request/response models for the calendar API.
//!
//! Instants are epoch-millis (`i64`) to match the frontend and the DB columns.

use serde::{Deserialize, Serialize};

#[cfg(feature = "axum")]
use utoipa::ToSchema;

/// An invited attendee on an event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "axum", derive(ToSchema))]
pub struct Attendee {
    /// Attendee email address.
    pub email: String,
    /// Optional display name.
    pub name: Option<String>,
    /// RSVP status: `pending` | `accepted` | `declined` | `tentative`.
    pub status: String,
    /// Epoch-millis the invite was sent, if it has been.
    pub invited_ms: Option<i64>,
}

/// A calendar event owned by the requesting user.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "axum", derive(ToSchema))]
pub struct CalendarEvent {
    /// Event id (UUID, serialized as a string).
    pub id: String,
    /// Event title.
    pub title: String,
    /// Optional long-form description.
    pub description: Option<String>,
    /// Optional location / conferencing link.
    pub location: Option<String>,
    /// Start instant (epoch-millis, UTC).
    pub start_ms: i64,
    /// End instant (epoch-millis, UTC).
    pub end_ms: i64,
    /// Whether this is an all-day event.
    pub all_day: bool,
    /// Accent color key (e.g. `blue`, `green`).
    pub color: String,
    /// Invited attendees.
    pub attendees: Vec<Attendee>,
}

/// An attendee supplied when creating/updating an event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "axum", derive(ToSchema))]
pub struct AttendeeInput {
    /// Attendee email address.
    pub email: String,
    /// Optional display name.
    pub name: Option<String>,
}

/// Body for `POST /calendar/events`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "axum", derive(ToSchema))]
pub struct CreateEventRequest {
    /// Event title.
    pub title: String,
    /// Optional description.
    pub description: Option<String>,
    /// Optional location.
    pub location: Option<String>,
    /// Start instant (epoch-millis).
    pub start_ms: i64,
    /// End instant (epoch-millis).
    pub end_ms: i64,
    /// All-day flag.
    #[serde(default)]
    pub all_day: bool,
    /// Accent color key; defaults to `blue` when omitted.
    #[serde(default = "default_color")]
    pub color: String,
    /// Attendees to invite.
    #[serde(default)]
    pub attendees: Vec<AttendeeInput>,
}

/// Body for `PUT /calendar/events/{id}`. Same shape as create.
pub type UpdateEventRequest = CreateEventRequest;

/// Body for `POST /calendar/events/{id}/invite`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "axum", derive(ToSchema))]
pub struct InviteRequest {
    /// Attendee emails that have just been (or are being) emailed an invite.
    /// Any not already on the event are added.
    pub emails: Vec<String>,
}

fn default_color() -> String {
    "blue".to_string()
}
