use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Settings {
    pub link_id: Uuid,
    pub signature_on_replies_forwards: bool,
    pub read_receipts_enabled: bool,
}

impl From<crate::email::db::settings::Settings> for Settings {
    fn from(db_settings: crate::email::db::settings::Settings) -> Self {
        Settings {
            link_id: db_settings.link_id,
            signature_on_replies_forwards: db_settings.signature_on_replies_forwards,
            read_receipts_enabled: db_settings.read_receipts_enabled,
        }
    }
}

/// A partial settings update. Fields left as `None` keep their current value,
/// so a client can patch a single setting without clobbering the others.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsPatch {
    pub link_id: Uuid,
    pub signature_on_replies_forwards: Option<bool>,
    pub read_receipts_enabled: Option<bool>,
}

impl SettingsPatch {
    pub fn new(api_settings: crate::email::api::settings::Settings, link_id: Uuid) -> Self {
        SettingsPatch {
            link_id,
            signature_on_replies_forwards: api_settings.signature_on_replies_forwards,
            read_receipts_enabled: api_settings.read_receipts_enabled,
        }
    }
}
