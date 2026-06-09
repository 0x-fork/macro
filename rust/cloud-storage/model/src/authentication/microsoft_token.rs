/// An access token minted for a linked Microsoft (Outlook) account, returned by
/// the authentication service's internal token endpoint. Mirrors
/// [`super::google_token::GoogleAccessToken`].
#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct MicrosoftAccessToken {
    /// The user's Microsoft Graph access token.
    pub access_token: String,
}
