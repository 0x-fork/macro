//! This crate contains the document sub type enum and various logic for it
use schemars::JsonSchema;

/// The document sub type enum represents all values of document sub types.
/// These values should match the `document_sub_type_value` table in macrodb.
#[derive(
    serde::Serialize,
    serde::Deserialize,
    Eq,
    PartialEq,
    Debug,
    utoipa::ToSchema,
    Clone,
    Copy,
    strum::EnumString,
    strum::Display,
    JsonSchema,
)]
#[cfg_attr(feature = "sqlx", derive(sqlx::Type))]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "snake_case")]
#[cfg_attr(
    feature = "sqlx",
    sqlx(type_name = "\"document_sub_type_value\"", rename_all = "lowercase")
)]
pub enum DocumentSubType {
    /// A task document
    Task,
}
