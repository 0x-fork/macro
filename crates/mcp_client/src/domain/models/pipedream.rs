//! Domain models for the Pipedream Connect integration.

/// A short-lived token for opening Pipedream's hosted Connect UI.
#[derive(Clone, Debug)]
pub struct ConnectToken {
    /// The Connect token itself.
    pub token: String,
    /// RFC 3339 expiry of the token.
    pub expires_at: String,
    /// Shareable link that opens the same connect flow in a browser tab.
    pub connect_link_url: String,
}

/// A connected account as reported by Pipedream.
#[derive(Clone, Debug)]
pub struct PipedreamAccount {
    /// Pipedream's connected-account ID (`apn_...`).
    pub id: String,
    /// The external user ID the account was connected for (our user ID).
    pub external_user_id: Option<String>,
    /// The app the account belongs to (name slug, e.g. `linear`).
    pub app_slug: String,
    /// Human-readable app name, e.g. `Linear`.
    pub app_name: String,
    /// Whether Pipedream considers the account's credentials healthy.
    pub healthy: bool,
}
