//! Channel literal evaluation, mirroring the soup channel SQL in
//! `comms/src/outbound/postgres/comms_repo/dynamic.rs`.
//!
//! Note: the `SoupChannel` wire shape is snake_case (unlike most soup
//! entities) and nests the core fields under `data.channel`.

use item_filters::ast::channel::ChannelLiteral;

use crate::item::{i64_field, object_field, str_eq, uuid_eq};
use crate::{Data, Truth};

pub(crate) fn eval(literal: &ChannelLiteral, data: &Data) -> Truth {
    let Some(channel) = object_field(data, "channel") else {
        return Truth::Unknown;
    };
    match literal {
        // The soup channel SQL compiles these message-level literals to
        // no-op clauses (they only apply in search_service).
        ChannelLiteral::ThreadId(_) | ChannelLiteral::Mention(_) | ChannelLiteral::Sender(_) => {
            Truth::Match
        }
        ChannelLiteral::OrganizationId(org) => match i64_field(channel, "org_id") {
            Some(actual) => (actual == *org).into(),
            None => Truth::Unknown,
        },
        ChannelLiteral::TeamId(team) => uuid_eq(channel, "team_id", team),
        ChannelLiteral::ChannelId(id) => uuid_eq(channel, "id", id),
        ChannelLiteral::ChannelType(ct) => str_eq(channel, "channel_type", &ct.to_string()),
        // SQL: no-op for true; 1=0 for false.
        ChannelLiteral::Importance(true) => Truth::Match,
        ChannelLiteral::Importance(false) => Truth::NoMatch,
        ChannelLiteral::NotificationDone(_) | ChannelLiteral::NotificationSeen(_) => Truth::Unknown,
    }
}
