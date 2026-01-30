//! Document family types.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// A document family.
#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentFamily {
    /// The document family id
    pub id: i64,
    /// The root documents uuid
    pub root_document_id: String,
}
