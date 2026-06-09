//! Postgres adapter for the calendar repository.
//!
//! Uses sqlx's runtime-checked query API (rather than the `query!` macros) so
//! the crate compiles without a live database or a prepared offline cache.

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::domain::models::{Attendee, CalendarEvent, CreateEventRequest, UpdateEventRequest};
use crate::domain::ports::CalendarRepository;
use rootcause::Report;
use sqlx::PgPool;
use sqlx::types::Uuid;

/// Database-backed implementation of [`CalendarRepository`].
pub struct DbCalendarRepository {
    /// The PostgreSQL connection pool.
    pub db: PgPool,
}

impl DbCalendarRepository {
    /// Creates a new repository over the given pool.
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }
}

#[derive(sqlx::FromRow)]
struct EventRow {
    id: Uuid,
    title: String,
    description: Option<String>,
    location: Option<String>,
    start_ms: i64,
    end_ms: i64,
    all_day: bool,
    color: String,
}

#[derive(sqlx::FromRow)]
struct AttendeeRow {
    event_id: Uuid,
    email: String,
    name: Option<String>,
    status: String,
    invited_ms: Option<i64>,
}

const EVENT_COLUMNS: &str =
    "id, title, description, location, start_ms, end_ms, all_day, color";

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Parse a path-supplied id; a malformed id can never match a row, so callers
/// treat `None` as "not found" rather than surfacing a 500.
fn parse_id(event_id: &str) -> Option<Uuid> {
    Uuid::parse_str(event_id).ok()
}

impl EventRow {
    fn into_event(self, attendees: Vec<Attendee>) -> CalendarEvent {
        CalendarEvent {
            id: self.id.to_string(),
            title: self.title,
            description: self.description,
            location: self.location,
            start_ms: self.start_ms,
            end_ms: self.end_ms,
            all_day: self.all_day,
            color: self.color,
            attendees,
        }
    }
}

impl AttendeeRow {
    fn into_attendee(self) -> Attendee {
        Attendee {
            email: self.email,
            name: self.name,
            status: self.status,
            invited_ms: self.invited_ms,
        }
    }
}

impl DbCalendarRepository {
    /// Loads attendees for a set of event ids, grouped by event id.
    async fn attendees_for(
        &self,
        event_ids: &[Uuid],
    ) -> Result<HashMap<Uuid, Vec<Attendee>>, Report> {
        let mut grouped: HashMap<Uuid, Vec<Attendee>> = HashMap::new();
        if event_ids.is_empty() {
            return Ok(grouped);
        }

        let rows = sqlx::query_as::<_, AttendeeRow>(
            "SELECT event_id, email, name, status, invited_ms
             FROM calendar_attendee
             WHERE event_id = ANY($1)
             ORDER BY created_ms ASC",
        )
        .bind(event_ids)
        .fetch_all(&self.db)
        .await?;

        for row in rows {
            grouped.entry(row.event_id).or_default().push(row.into_attendee());
        }
        Ok(grouped)
    }

    /// Re-reads a single owned event and assembles its attendees.
    async fn fetch_one(
        &self,
        user_id: &str,
        id: Uuid,
    ) -> Result<Option<CalendarEvent>, Report> {
        let row = sqlx::query_as::<_, EventRow>(&format!(
            "SELECT {EVENT_COLUMNS} FROM calendar_event WHERE id = $1 AND user_id = $2"
        ))
        .bind(id)
        .bind(user_id)
        .fetch_optional(&self.db)
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };
        let mut grouped = self.attendees_for(&[row.id]).await?;
        let attendees = grouped.remove(&row.id).unwrap_or_default();
        Ok(Some(row.into_event(attendees)))
    }

    /// Inserts/updates attendees from a create/update request.
    async fn upsert_attendees(
        &self,
        event_id: Uuid,
        attendees: &[crate::domain::models::AttendeeInput],
    ) -> Result<(), Report> {
        for attendee in attendees {
            sqlx::query(
                "INSERT INTO calendar_attendee (event_id, email, name)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (event_id, email) DO UPDATE SET name = EXCLUDED.name",
            )
            .bind(event_id)
            .bind(&attendee.email)
            .bind(&attendee.name)
            .execute(&self.db)
            .await?;
        }
        Ok(())
    }
}

impl CalendarRepository for DbCalendarRepository {
    async fn list_events(
        &self,
        user_id: &str,
        start_ms: i64,
        end_ms: i64,
    ) -> Result<Vec<CalendarEvent>, Report> {
        let event_rows = sqlx::query_as::<_, EventRow>(&format!(
            "SELECT {EVENT_COLUMNS} FROM calendar_event
             WHERE user_id = $1 AND start_ms < $3 AND end_ms > $2
             ORDER BY start_ms ASC"
        ))
        .bind(user_id)
        .bind(start_ms)
        .bind(end_ms)
        .fetch_all(&self.db)
        .await?;

        let ids: Vec<Uuid> = event_rows.iter().map(|r| r.id).collect();
        let mut grouped = self.attendees_for(&ids).await?;

        Ok(event_rows
            .into_iter()
            .map(|row| {
                let attendees = grouped.remove(&row.id).unwrap_or_default();
                row.into_event(attendees)
            })
            .collect())
    }

    async fn get_event(
        &self,
        user_id: &str,
        event_id: &str,
    ) -> Result<Option<CalendarEvent>, Report> {
        let Some(id) = parse_id(event_id) else {
            return Ok(None);
        };
        self.fetch_one(user_id, id).await
    }

    async fn create_event(
        &self,
        user_id: &str,
        request: CreateEventRequest,
    ) -> Result<CalendarEvent, Report> {
        let row = sqlx::query_as::<_, EventRow>(&format!(
            "INSERT INTO calendar_event
                (user_id, title, description, location, start_ms, end_ms, all_day, color)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING {EVENT_COLUMNS}"
        ))
        .bind(user_id)
        .bind(&request.title)
        .bind(&request.description)
        .bind(&request.location)
        .bind(request.start_ms)
        .bind(request.end_ms)
        .bind(request.all_day)
        .bind(&request.color)
        .fetch_one(&self.db)
        .await?;

        self.upsert_attendees(row.id, &request.attendees).await?;

        let mut grouped = self.attendees_for(&[row.id]).await?;
        let attendees = grouped.remove(&row.id).unwrap_or_default();
        Ok(row.into_event(attendees))
    }

    async fn update_event(
        &self,
        user_id: &str,
        event_id: &str,
        request: UpdateEventRequest,
    ) -> Result<Option<CalendarEvent>, Report> {
        let Some(id) = parse_id(event_id) else {
            return Ok(None);
        };

        let updated = sqlx::query_as::<_, EventRow>(&format!(
            "UPDATE calendar_event SET
                title = $3, description = $4, location = $5,
                start_ms = $6, end_ms = $7, all_day = $8, color = $9,
                updated_ms = (floor(extract(epoch FROM now()) * 1000))::bigint
             WHERE id = $1 AND user_id = $2
             RETURNING {EVENT_COLUMNS}"
        ))
        .bind(id)
        .bind(user_id)
        .bind(&request.title)
        .bind(&request.description)
        .bind(&request.location)
        .bind(request.start_ms)
        .bind(request.end_ms)
        .bind(request.all_day)
        .bind(&request.color)
        .fetch_optional(&self.db)
        .await?;

        if updated.is_none() {
            return Ok(None);
        }

        // Sync attendees: drop any no longer present, then upsert the rest.
        let emails: Vec<String> = request.attendees.iter().map(|a| a.email.clone()).collect();
        sqlx::query(
            "DELETE FROM calendar_attendee WHERE event_id = $1 AND NOT (email = ANY($2))",
        )
        .bind(id)
        .bind(&emails)
        .execute(&self.db)
        .await?;
        self.upsert_attendees(id, &request.attendees).await?;

        self.fetch_one(user_id, id).await
    }

    async fn delete_event(&self, user_id: &str, event_id: &str) -> Result<bool, Report> {
        let Some(id) = parse_id(event_id) else {
            return Ok(false);
        };
        let result = sqlx::query("DELETE FROM calendar_event WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(&self.db)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn mark_invited(
        &self,
        user_id: &str,
        event_id: &str,
        emails: Vec<String>,
    ) -> Result<Option<CalendarEvent>, Report> {
        let Some(id) = parse_id(event_id) else {
            return Ok(None);
        };

        // Ownership check: only the owner may invite, and we must 404 otherwise.
        if self.fetch_one(user_id, id).await?.is_none() {
            return Ok(None);
        }

        let invited_ms = now_ms();
        for email in &emails {
            sqlx::query(
                "INSERT INTO calendar_attendee (event_id, email, invited_ms)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (event_id, email) DO UPDATE SET invited_ms = EXCLUDED.invited_ms",
            )
            .bind(id)
            .bind(email)
            .bind(invited_ms)
            .execute(&self.db)
            .await?;
        }

        self.fetch_one(user_id, id).await
    }
}
