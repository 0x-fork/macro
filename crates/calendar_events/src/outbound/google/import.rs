//! Importing a snapshot of another calendar's event under its iCalendar UID.
use super::*;
use crate::domain::ics::CalendarEventExport;

/// Private extended property marking an event as Macro's snapshot of a
/// shared meeting. Private properties stay on the calendar copy they were
/// written to, so no other copy of the meeting ever carries the marker.
pub(super) const SNAPSHOT_PROPERTY: &str = "macroSnapshot";

impl<G: GoogleRequestGate> GoogleCalendarClient<G> {
    pub(super) async fn import_copy(
        &self,
        access_token: &str,
        target: &ProviderCalendarTarget,
        source: &CalendarEventExport,
    ) -> Result<ProviderImportOutcome, CalendarProviderError> {
        if self
            .holds_ical_uid(access_token, target, &source.ical_uid)
            .await?
        {
            return Ok(ProviderImportOutcome::AlreadyHeld);
        }
        let calendar = urlencoding::encode(&target.provider_calendar_id);
        self.gate.acquire(target.email_link_id).await?;
        // Import never notifies anyone, so it takes no `sendUpdates`.
        let request = self
            .client
            .post(format!(
                "{}/calendars/{calendar}/events/import",
                self.api_base
            ))
            .bearer_auth(access_token)
            .json(&import_body(source, &target.provider_calendar_id));
        let imported: GoogleEvent = match send_google(GoogleRequestKind::Mutation, request).await {
            Ok(imported) => imported,
            // A permanent failure is Google refusing this import for this
            // calendar, such as `participantIsNeitherOrganizerNorAttendee`;
            // rate limits and lapsed grants still classify as transient or
            // reauth.
            Err(error) if error.kind() == CalendarProviderErrorKind::Permanent => {
                return Ok(ProviderImportOutcome::Refused(error));
            }
            Err(error) => return Err(error),
        };
        self.mutation_readback(access_token, target, imported)
            .await?
            .ok_or_else(|| {
                CalendarProviderError::new(
                    CalendarProviderErrorKind::Permanent,
                    "Google Calendar dropped the event immediately after import",
                )
            })
            .map(|upsert| ProviderImportOutcome::Imported(Box::new(upsert)))
    }

    /// Whether the calendar holds a live event under `ical_uid`, counting an
    /// invitation the user has hidden: Macro never syncs those, and an
    /// import would update one in place all the same.
    async fn holds_ical_uid(
        &self,
        access_token: &str,
        target: &ProviderCalendarTarget,
        ical_uid: &str,
    ) -> Result<bool, CalendarProviderError> {
        let calendar = urlencoding::encode(&target.provider_calendar_id);
        self.gate.acquire(target.email_link_id).await?;
        let request = self
            .client
            .get(format!("{}/calendars/{calendar}/events", self.api_base))
            .bearer_auth(access_token)
            .query(&[
                ("maxResults", "1"),
                ("singleEvents", "false"),
                ("showDeleted", "false"),
                ("showHiddenInvitations", "true"),
                ("iCalUID", ical_uid),
            ]);
        let page: GoogleEventListResponse = send_google(GoogleRequestKind::Read, request).await?;
        Ok(!page.items.is_empty())
    }
}

/// A snapshot of another calendar's event: the meeting's UID, organizer and
/// content, with the calendar as its only guest and Macro's snapshot marker.
///
/// Google imports an event only into the calendar of its organizer or one of
/// its attendees, and names a calendar among an event's attendees by the
/// calendar's ID, the account's address for a primary calendar. Listing that
/// calendar, already accepted, lets the import through while leaving out the
/// meeting's guests and conference, so importing it invites no one and
/// exposes no guest list or join link the share did not.
pub(super) fn import_body(
    source: &CalendarEventExport,
    provider_calendar_id: &str,
) -> serde_json::Value {
    let (start, end) = google_time_body(&source.time);
    let mut body = serde_json::json!({
        "iCalUID": source.ical_uid,
        "summary": source.title,
        "start": start,
        "end": end,
        "sequence": source.sequence,
        "attendees": [{ "email": provider_calendar_id, "responseStatus": "accepted" }],
        "extendedProperties": { "private": { SNAPSHOT_PROPERTY: "true" } },
    });
    if let Some(description) = source
        .description
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        body["description"] = serde_json::Value::String(description.to_string());
    }
    if let Some(location) = source.location.as_deref().filter(|value| !value.is_empty()) {
        body["location"] = serde_json::Value::String(location.to_string());
    }
    if !source.recurrence_lines.is_empty() {
        body["recurrence"] = serde_json::json!(source.recurrence_lines);
    }
    if let Some(email) = &source.organizer_email {
        let mut organizer = serde_json::json!({ "email": email });
        if let Some(name) = &source.organizer_name {
            organizer["displayName"] = serde_json::Value::String(name.clone());
        }
        body["organizer"] = organizer;
    }
    body
}

/// Whether the event carries Macro's snapshot marker.
pub(super) fn is_snapshot(event: &GoogleEvent) -> bool {
    event
        .extended_properties
        .as_ref()
        .and_then(|properties| properties.private.get(SNAPSHOT_PROPERTY))
        .is_some_and(|value| value == "true")
}
