//! Project literal evaluation, mirroring `build_project_filter` in
//! `soup/src/outbound/pg_soup_repo/expanded/dynamic.rs`.

use item_filters::ast::project::ProjectLiteral;

use crate::item::{date_cmp, str_eq, uuid_eq};
use crate::{Ctx, Data, Truth};

pub(crate) fn eval(literal: &ProjectLiteral, data: &Data, ctx: &Ctx<'_>) -> Truth {
    match literal {
        // SQL: p."parentId" = '{p}' (direct children).
        ProjectLiteral::ProjectId(p) => uuid_eq(data, "parentId", p),
        // SQL: p.id = '{p}' (the project itself).
        ProjectLiteral::ProjectIdSelf(p) => uuid_eq(data, "id", p),
        // SQL: p."userId" = '{o}' — exposed as ownerId on the payload.
        ProjectLiteral::Owner(o) => str_eq(data, "ownerId", &o.to_string()),
        // SQL: no-op for true; 1=0 for false ("all projects are important").
        ProjectLiteral::Importance(true) => Truth::Match,
        ProjectLiteral::Importance(false) => Truth::NoMatch,
        // EXISTS probes against the user's notifications; decidable only
        // through caller-asserted state (see [`crate::ItemState`]).
        ProjectLiteral::NotificationDone(want) => ctx.state.notification_done(*want),
        ProjectLiteral::NotificationSeen(want) => ctx.state.notification_seen(*want),
        ProjectLiteral::CreatedAt(lit) => date_cmp(data, "createdAt", lit),
        ProjectLiteral::UpdatedAt(lit) => date_cmp(data, "updatedAt", lit),
    }
}
