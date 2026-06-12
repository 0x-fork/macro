//! Document literal evaluation, mirroring `build_document_filter` in
//! `soup/src/outbound/pg_soup_repo/expanded/dynamic.rs`.

use item_filters::ast::document::DocumentLiteral;

use crate::item::{bool_field, date_cmp, object_field, str_eq, str_field, uuid_eq};
use crate::{Data, EvalOptions, Truth};

/// The document's task sub-type state, read from `data.subType`.
enum SubType {
    /// No `subType` on the payload (plain document).
    None,
    /// `subType.type == "task"`, with its completion flag.
    Task { is_completed: Option<bool> },
    /// A sub type this build doesn't recognize.
    Other,
}

fn sub_type(data: &Data) -> SubType {
    match object_field(data, "subType") {
        None => SubType::None,
        Some(st) => match str_field(st, "type") {
            Some("task") => SubType::Task {
                is_completed: bool_field(st, "is_completed"),
            },
            _ => SubType::Other,
        },
    }
}

pub(crate) fn eval(literal: &DocumentLiteral, data: &Data, opts: &EvalOptions) -> Truth {
    match literal {
        // SQL: d."fileType" = '{f}'
        DocumentLiteral::FileType(f) => str_eq(data, "fileType", &f.to_string()),
        // SQL: d.id = '{i}'
        DocumentLiteral::Id(i) => uuid_eq(data, "id", i),
        // SQL: d."projectId" = '{p}' (direct membership, no descendant
        // expansion at the literal level)
        DocumentLiteral::ProjectId(p) => uuid_eq(data, "projectId", p),
        // SQL: d.owner = '{o}'
        DocumentLiteral::Owner(o) => str_eq(data, "ownerId", &o.to_string()),
        // SQL (true): non-task OR task assigned to the requesting user.
        // The assignee check reads the Assignees system property join, which
        // the evaluator cannot identify locally yet, so tasks are Unknown.
        DocumentLiteral::Importance(true) => match sub_type(data) {
            SubType::None => Truth::Match,
            SubType::Task { .. } | SubType::Other => Truth::Unknown,
        },
        // SQL (false): task AND not assigned to the requesting user.
        DocumentLiteral::Importance(false) => match sub_type(data) {
            SubType::None => Truth::NoMatch,
            SubType::Task { .. } | SubType::Other => Truth::Unknown,
        },
        // Notification state lives in NotificationItems, not on the payload.
        DocumentLiteral::NotificationDone(_) | DocumentLiteral::NotificationSeen(_) => {
            Truth::Unknown
        }
        // SQL (true): sub_type = 'task' AND owner = $user AND assignees
        // contains $user AND NOT completed. The assignee conjunct is Unknown
        // locally; every other conjunct can still force NoMatch.
        DocumentLiteral::IncludeCbmAtmNc(true) => {
            let task = match sub_type(data) {
                SubType::Task { is_completed } => is_completed,
                SubType::None | SubType::Other => return Truth::NoMatch,
            };
            let owner = match &opts.current_user_id {
                Some(user) => str_eq(data, "ownerId", user),
                None => Truth::Unknown,
            };
            let not_completed = match task {
                Some(done) => (!done).into(),
                None => Truth::Unknown,
            };
            owner.and(not_completed).and(Truth::Unknown)
        }
        // SQL compiles `false` to a no-op clause.
        DocumentLiteral::IncludeCbmAtmNc(false) => Truth::Match,
        // SQL: dt.sub_type IS NOT NULL AND dt.sub_type = '{st}' — absence is
        // a definite non-match because of the explicit null guard.
        DocumentLiteral::SubType(st) => match object_field(data, "subType") {
            None => Truth::NoMatch,
            Some(obj) => match str_field(obj, "type") {
                Some(actual) => (actual == st.to_string()).into(),
                None => Truth::Unknown,
            },
        },
        // SQL: EXISTS(... document_email ...) — not on the payload.
        DocumentLiteral::IsEmailAttachment(_) => Truth::Unknown,
        // SQL: d."createdAt" / d."updatedAt" comparisons.
        DocumentLiteral::CreatedAt(lit) => date_cmp(data, "createdAt", lit),
        DocumentLiteral::UpdatedAt(lit) => date_cmp(data, "updatedAt", lit),
    }
}
