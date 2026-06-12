//! Email literal evaluation.
//!
//! Email filtering is the least locally-decidable domain: the SQL in
//! `email/src/outbound/email_pg_repo/dynamic/` matches per-message address
//! rows, label joins, and share tables, while the soup payload carries a
//! thread-level preview. Literals that need message-level or join data are
//! `Unknown`; the rest mirror the candidate-stage SQL.

use item_filters::ast::email::{Email, EmailLiteral};

use crate::item::{array_field, date_cmp, str_field, uuid_eq};
use crate::{Data, Truth};

/// Case-insensitive string equality, as the SQL compares lowercased
/// addresses.
fn eq_ci(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

pub(crate) fn eval(literal: &EmailLiteral, data: &Data) -> Truth {
    match literal {
        // Candidate-stage SQL: email_threads.id = '{t}'.
        EmailLiteral::ThreadId(t) => uuid_eq(data, "id", t),
        // Candidate-stage SQL: email_threads.link_id = '{o}'. The preview
        // does not carry link_id directly, but every resolved participant
        // contact does, and a thread's contacts are resolved through the
        // thread's link.
        EmailLiteral::Owner(link_id) => {
            let Some(participants) = array_field(data, "participants") else {
                return Truth::Unknown;
            };
            let link_ids: Vec<&str> = participants
                .iter()
                .filter_map(|p| p.as_object().and_then(|p| str_field(p, "linkId")))
                .collect();
            if link_ids.is_empty() {
                return Truth::Unknown;
            }
            let expected = link_id.to_string();
            link_ids.iter().any(|l| eq_ci(l, &expected)).into()
        }
        // Candidate-stage SQL: project id equality on the thread.
        EmailLiteral::ProjectId(p) => match str_field(data, "projectId") {
            Some(actual) => (actual == p).into(),
            None => Truth::Unknown,
        },
        // Message-level address predicates. The preview only exposes the
        // representative sender, so a positive sender match is decidable;
        // everything else needs per-message, per-direction address rows.
        EmailLiteral::Sender(Email::Complete(e)) => match str_field(data, "senderEmail") {
            Some(actual) if eq_ci(actual, &String::from(e.clone())) => Truth::Match,
            _ => Truth::Unknown,
        },
        EmailLiteral::Sender(_)
        | EmailLiteral::Cc(_)
        | EmailLiteral::Bcc(_)
        | EmailLiteral::Recipient(_) => Truth::Unknown,
        // The preview's isImportant flag is the server-computed importance
        // for the thread, matching the label-based Importance SQL.
        EmailLiteral::Importance(want) => match data.get("isImportant").and_then(|v| v.as_bool()) {
            Some(actual) => (actual == *want).into(),
            None => Truth::Unknown,
        },
        EmailLiteral::NotificationDone(_) | EmailLiteral::NotificationSeen(_) => Truth::Unknown,
        // Share provenance is not on the payload.
        EmailLiteral::Shared(_) => Truth::Unknown,
        // SQL (true): some message has an .ics attachment (filename or
        // application/ics mime type). A positive hit on the preview's
        // attachments is decisive; absence is left Unknown until the
        // completeness of the preview's attachment list is pinned down.
        EmailLiteral::CalendarOnly(true) => {
            let Some(attachments) = array_field(data, "attachments") else {
                return Truth::Unknown;
            };
            let has_ics = attachments.iter().filter_map(|a| a.as_object()).any(|a| {
                let by_name = str_field(a, "filename")
                    .is_some_and(|f| f.to_ascii_lowercase().ends_with(".ics"));
                let by_mime = str_field(a, "mimeType").is_some_and(|m| eq_ci(m, "application/ics"));
                by_name || by_mime
            });
            if has_ics {
                Truth::Match
            } else {
                Truth::Unknown
            }
        }
        // Expansion only emits CalendarOnly(true); false applies no
        // constraint.
        EmailLiteral::CalendarOnly(false) => Truth::Match,
        EmailLiteral::CreatedAt(lit) => date_cmp(data, "createdAt", lit),
        // updated_at is view-dependent (email_view request parameter) in the
        // SQL; the preview does not say which view produced it.
        EmailLiteral::UpdatedAt(_) => Truth::Unknown,
    }
}
