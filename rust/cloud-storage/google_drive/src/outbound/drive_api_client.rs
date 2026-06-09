//! [`DriveApi`] adapter backed by the Google Drive REST API v3 over `reqwest`.

use anyhow::Context;

use crate::domain::models::{DriveFile, DriveFileList};
use crate::domain::ports::DriveApi;

/// Default Drive API v3 base URL.
const DEFAULT_BASE_URL: &str = "https://www.googleapis.com/drive/v3";

/// Fields requested for a single file. Keep in sync with [`DriveFile`].
const FILE_FIELDS: &str = "id,name,mimeType,parents,size,modifiedTime,webViewLink,trashed";

/// Page size for `files.list`. Drive caps this at 1000; 200 keeps responses small.
const PAGE_SIZE: &str = "200";

/// `reqwest`-backed Google Drive client.
#[derive(Clone)]
pub struct DriveApiClient {
    inner: reqwest::Client,
    base_url: String,
}

impl Default for DriveApiClient {
    fn default() -> Self {
        Self::new()
    }
}

impl DriveApiClient {
    /// Create a client targeting the public Drive API.
    pub fn new() -> Self {
        Self {
            inner: reqwest::Client::new(),
            base_url: DEFAULT_BASE_URL.to_string(),
        }
    }

    /// Create a client targeting a custom base URL (for tests / mock servers).
    pub fn with_base_url(inner: reqwest::Client, base_url: impl Into<String>) -> Self {
        Self {
            inner,
            base_url: base_url.into(),
        }
    }

    /// Fetch a URL with a bearer token and download the raw body bytes, used
    /// for both direct downloads and exports.
    async fn get_bytes(
        &self,
        access_token: &str,
        url: &str,
        query: &[(&str, &str)],
    ) -> anyhow::Result<Vec<u8>> {
        let response = self
            .inner
            .get(url)
            .bearer_auth(access_token)
            .query(query)
            .send()
            .await
            .context("drive request failed")?
            .error_for_status()
            .context("drive returned an error status")?;

        let bytes = response
            .bytes()
            .await
            .context("failed to read drive response body")?;
        Ok(bytes.to_vec())
    }
}

impl DriveApi for DriveApiClient {
    type Err = anyhow::Error;

    #[tracing::instrument(skip(self, access_token), err)]
    async fn list_children(
        &self,
        access_token: &str,
        folder_id: &str,
        page_token: Option<&str>,
    ) -> Result<DriveFileList, Self::Err> {
        // Drive query: direct children of `folder_id`, excluding trashed items.
        let q = format!(
            "'{}' in parents and trashed = false",
            escape_query(folder_id)
        );
        let fields = format!("nextPageToken,files({FILE_FIELDS})");

        let mut query: Vec<(&str, &str)> = vec![
            ("q", q.as_str()),
            ("fields", fields.as_str()),
            ("pageSize", PAGE_SIZE),
            ("supportsAllDrives", "true"),
            ("includeItemsFromAllDrives", "true"),
            // Order folders first, then by name, for a stable picker experience.
            ("orderBy", "folder,name"),
        ];
        if let Some(token) = page_token {
            query.push(("pageToken", token));
        }

        let response = self
            .inner
            .get(format!("{}/files", self.base_url))
            .bearer_auth(access_token)
            .query(&query)
            .send()
            .await
            .context("drive files.list request failed")?
            .error_for_status()
            .context("drive files.list returned an error status")?;

        response
            .json::<DriveFileList>()
            .await
            .context("failed to deserialize drive files.list response")
    }

    #[tracing::instrument(skip(self, access_token), err)]
    async fn get_file(&self, access_token: &str, file_id: &str) -> Result<DriveFile, Self::Err> {
        let response = self
            .inner
            .get(format!("{}/files/{file_id}", self.base_url))
            .bearer_auth(access_token)
            .query(&[("fields", FILE_FIELDS), ("supportsAllDrives", "true")])
            .send()
            .await
            .context("drive files.get request failed")?
            .error_for_status()
            .context("drive files.get returned an error status")?;

        response
            .json::<DriveFile>()
            .await
            .context("failed to deserialize drive files.get response")
    }

    #[tracing::instrument(skip(self, access_token), err)]
    async fn download_file(&self, access_token: &str, file_id: &str) -> Result<Vec<u8>, Self::Err> {
        let url = format!("{}/files/{file_id}", self.base_url);
        self.get_bytes(
            access_token,
            &url,
            &[("alt", "media"), ("supportsAllDrives", "true")],
        )
        .await
    }

    #[tracing::instrument(skip(self, access_token), err)]
    async fn export_file(
        &self,
        access_token: &str,
        file_id: &str,
        export_mime: &str,
    ) -> Result<Vec<u8>, Self::Err> {
        let url = format!("{}/files/{file_id}/export", self.base_url);
        self.get_bytes(access_token, &url, &[("mimeType", export_mime)])
            .await
    }
}

/// Escape a value for safe interpolation into a Drive `q` query string, where
/// `'` is the string delimiter and `\` the escape character.
fn escape_query(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "\\'")
}
