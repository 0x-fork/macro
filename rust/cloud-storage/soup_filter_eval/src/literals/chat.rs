//! Chat literal evaluation, mirroring `build_chat_filter` in
//! `soup/src/outbound/pg_soup_repo/expanded/dynamic.rs`.

use item_filters::ast::chat::ChatLiteral;

use crate::item::{date_cmp, str_eq, uuid_eq};
use crate::{Data, Truth};

pub(crate) fn eval(literal: &ChatLiteral, data: &Data) -> Truth {
    match literal {
        // SQL: c."projectId" = '{p}'
        ChatLiteral::ProjectId(p) => uuid_eq(data, "projectId", p),
        // SQL compiles Role to a no-op clause today.
        ChatLiteral::Role(_) => Truth::Match,
        // SQL: c.id = '{i}'
        ChatLiteral::ChatId(i) => uuid_eq(data, "id", i),
        // SQL: c."userId" = '{o}' — the payload exposes this as ownerId.
        ChatLiteral::Owner(o) => str_eq(data, "ownerId", &o.to_string()),
        // SQL: no-op for true; 1=0 for false ("all chats are important").
        ChatLiteral::Importance(true) => Truth::Match,
        ChatLiteral::Importance(false) => Truth::NoMatch,
        ChatLiteral::NotificationDone(_) | ChatLiteral::NotificationSeen(_) => Truth::Unknown,
        ChatLiteral::CreatedAt(lit) => date_cmp(data, "createdAt", lit),
        ChatLiteral::UpdatedAt(lit) => date_cmp(data, "updatedAt", lit),
    }
}
