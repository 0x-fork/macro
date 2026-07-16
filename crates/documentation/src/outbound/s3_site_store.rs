//! Published-site storage on S3.

use std::collections::HashSet;

use crate::domain::{
    model::SiteSlug,
    ports::{PublishedSiteStore, RenderedFile},
};

/// Cache lifetime for content that changes on every publish (HTML, search
/// index, sitemap). Kept short so a publish shows up quickly through the CDN.
const CONTENT_CACHE_CONTROL: &str = "public, max-age=300";
/// Cache lifetime for theme assets.
const ASSET_CACHE_CONTROL: &str = "public, max-age=86400";

/// [`PublishedSiteStore`] backed by the docs-sites S3 bucket. Each site
/// lives under its slug's prefix: `{slug}/{file path}`.
#[derive(Clone, Debug)]
pub struct S3SiteStore {
    s3: s3_client::S3,
    bucket: String,
}

impl S3SiteStore {
    /// Creates a new store over the given bucket.
    pub fn new(s3: s3_client::S3, bucket: String) -> Self {
        Self { s3, bucket }
    }

    fn cache_control(path: &str) -> &'static str {
        if path.starts_with("assets/") {
            ASSET_CACHE_CONTROL
        } else {
            CONTENT_CACHE_CONTROL
        }
    }
}

impl PublishedSiteStore for S3SiteStore {
    #[tracing::instrument(skip(self, files), err)]
    async fn publish(
        &self,
        slug: &SiteSlug,
        files: &[RenderedFile],
    ) -> Result<(), rootcause::Report> {
        let prefix = format!("{slug}/");

        // Upload the new site first, then prune leftovers from the previous
        // publish — a failure partway through never leaves the site down.
        let mut fresh_keys = HashSet::with_capacity(files.len());
        for file in files {
            let key = format!("{prefix}{}", file.path);
            self.s3
                .put_with_content_type(
                    &self.bucket,
                    &key,
                    &file.content,
                    file.content_type,
                    Some(Self::cache_control(&file.path)),
                )
                .await
                .map_err(|e| rootcause::report!("uploading {key}: {e:#}"))?;
            fresh_keys.insert(key);
        }

        let existing = self
            .s3
            .list_keys(&self.bucket, &prefix)
            .await
            .map_err(|e| rootcause::report!("listing published site {prefix}: {e:#}"))?;
        for key in existing {
            if !fresh_keys.contains(&key) {
                self.s3
                    .delete(&self.bucket, &key)
                    .await
                    .map_err(|e| rootcause::report!("pruning stale file {key}: {e:#}"))?;
            }
        }

        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn remove(&self, slug: &SiteSlug) -> Result<(), rootcause::Report> {
        let prefix = format!("{slug}/");
        self.s3
            .delete_folder(&self.bucket, &prefix)
            .await
            .map_err(|e| rootcause::report!("removing published site {prefix}: {e:#}"))
    }
}
