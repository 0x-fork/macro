#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct GithubAccessToken {
    /// The user's access token
    pub access_token: String,
}
