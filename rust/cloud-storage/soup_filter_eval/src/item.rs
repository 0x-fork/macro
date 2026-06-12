//! Field-access helpers over a soup item's `data` JSON object.
//!
//! All helpers return `Option`: an absent or differently-typed field yields
//! `None`, which literal evaluators translate to [`crate::Truth::Unknown`]
//! (mirroring SQL `NULL` comparison semantics) unless the SQL has an explicit
//! `IS NOT NULL` guard that makes absence a definite non-match.

use chrono::{DateTime, Utc};
use serde_json::Value;
use uuid::Uuid;

use crate::{Data, Truth};

/// Read a string field.
pub(crate) fn str_field<'a>(data: &'a Data, key: &str) -> Option<&'a str> {
    data.get(key).and_then(Value::as_str)
}

/// Read a boolean field.
pub(crate) fn bool_field(data: &Data, key: &str) -> Option<bool> {
    data.get(key).and_then(Value::as_bool)
}

/// Read an integer field.
pub(crate) fn i64_field(data: &Data, key: &str) -> Option<i64> {
    data.get(key).and_then(Value::as_i64)
}

/// Read a uuid field (serialized as a string).
pub(crate) fn uuid_field(data: &Data, key: &str) -> Option<Uuid> {
    str_field(data, key).and_then(|s| Uuid::parse_str(s).ok())
}

/// Read an RFC 3339 timestamp field (chrono's default `DateTime<Utc>` wire
/// format).
pub(crate) fn date_field(data: &Data, key: &str) -> Option<DateTime<Utc>> {
    str_field(data, key).and_then(|s| {
        DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|dt| dt.with_timezone(&Utc))
    })
}

/// Read an array field.
pub(crate) fn array_field<'a>(data: &'a Data, key: &str) -> Option<&'a Vec<Value>> {
    data.get(key).and_then(Value::as_array)
}

/// Read a nested object field.
pub(crate) fn object_field<'a>(data: &'a Data, key: &str) -> Option<&'a Data> {
    data.get(key).and_then(Value::as_object)
}

/// Compare a uuid field against a literal uuid; absence is `Unknown`.
pub(crate) fn uuid_eq(data: &Data, key: &str, expected: &Uuid) -> Truth {
    match uuid_field(data, key) {
        Some(actual) => (actual == *expected).into(),
        None => Truth::Unknown,
    }
}

/// Compare a string field against a literal; absence is `Unknown`.
pub(crate) fn str_eq(data: &Data, key: &str, expected: &str) -> Truth {
    match str_field(data, key) {
        Some(actual) => (actual == expected).into(),
        None => Truth::Unknown,
    }
}

/// Compare a boolean field against a literal; absence is `Unknown`.
pub(crate) fn bool_eq(data: &Data, key: &str, expected: bool) -> Truth {
    match bool_field(data, key) {
        Some(actual) => (actual == expected).into(),
        None => Truth::Unknown,
    }
}

/// Evaluate a [`item_filters::ast::date::DateLiteral`] against a timestamp
/// field; absence is `Unknown`.
pub(crate) fn date_cmp(
    data: &Data,
    key: &str,
    literal: &item_filters::ast::date::DateLiteral,
) -> Truth {
    use item_filters::ast::date::DateLiteral;
    let Some(actual) = date_field(data, key) else {
        return Truth::Unknown;
    };
    match literal {
        DateLiteral::GreaterThan(dt) => (actual > *dt).into(),
        DateLiteral::LessThan(dt) => (actual < *dt).into(),
        DateLiteral::GreaterThanOrEqual(dt) => (actual >= *dt).into(),
        DateLiteral::LessThanOrEqual(dt) => (actual <= *dt).into(),
    }
}
