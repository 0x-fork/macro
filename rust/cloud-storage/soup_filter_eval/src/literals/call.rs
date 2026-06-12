//! Call literal evaluation against the `SoupCallRecord` payload.

use item_filters::ast::call::CallLiteral;

use crate::item::{bool_eq, str_field, uuid_eq};
use crate::{Data, Truth};

pub(crate) fn eval(literal: &CallLiteral, data: &Data) -> Truth {
    match literal {
        CallLiteral::CallId(id) => uuid_eq(data, "callId", id),
        CallLiteral::ChannelId(id) => uuid_eq(data, "channelId", id),
        // Speakers come from transcript segments, which the soup payload
        // does not carry.
        CallLiteral::Speaker(_) => Truth::Unknown,
        // The payload carries the viewer-relative status precomputed by the
        // backend (`ATTENDED` / `MISSED` / `UNATTENDED` on the wire).
        CallLiteral::Status(status) => {
            let expected = serde_json::to_value(status)
                .ok()
                .and_then(|v| v.as_str().map(str::to_owned));
            match (str_field(data, "status"), expected) {
                (Some(actual), Some(expected)) => (actual == expected).into(),
                _ => Truth::Unknown,
            }
        }
        CallLiteral::Attended(want) => bool_eq(data, "attended", *want),
    }
}
