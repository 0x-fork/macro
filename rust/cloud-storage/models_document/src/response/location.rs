//! Location response types.

use super::PresignedUrl;
use crate::{DocumentBasic, FileType};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use sync_service_client::models::DocumentMetadata as SyncServiceMetadata;
use utoipa::ToSchema;

/// V3 location response with multiple variants.
#[derive(Serialize, Deserialize, Debug, ToSchema, Clone)]
#[serde(rename_all = "camelCase")]
pub enum LocationResponseV3 {
    /// Single presigned URL for static files
    PresignedUrl {
        /// The presigned URL
        presigned_url: String,
        /// Document metadata
        metadata: DocumentBasic,
    },
    /// Multiple presigned URLs for DOCX BOM parts
    PresignedUrls {
        /// The presigned URLs
        presigned_urls: Vec<PresignedUrl>,
        /// Document metadata
        metadata: DocumentBasic,
    },
    /// Sync service content for markdown files
    SyncServiceContent {
        /// Document metadata
        metadata: DocumentBasic,
        /// Sync service metadata
        sync_service_metadata: SyncServiceMetadata,
    },
}

impl LocationResponseV3 {
    /// Returns the document metadata.
    pub fn metadata(&self) -> &DocumentBasic {
        match self {
            Self::PresignedUrl { metadata, .. } => metadata,
            Self::PresignedUrls { metadata, .. } => metadata,
            Self::SyncServiceContent { metadata, .. } => metadata,
        }
    }

    /// Returns the sync service metadata if this is a sync service content response.
    pub fn sync_service_metadata(&self) -> Option<&SyncServiceMetadata> {
        if let Self::SyncServiceContent {
            sync_service_metadata,
            ..
        } = self
        {
            Some(sync_service_metadata)
        } else {
            None
        }
    }

    /// Attempts to parse and return the file type.
    pub fn file_type(&self) -> Result<FileType> {
        self.metadata()
            .file_type
            .as_deref()
            .map(FileType::from_str)
            .and_then(Result::ok)
            .ok_or_else(|| anyhow::anyhow!("unexpected file type {:?}", self.metadata().file_type))
    }
}
