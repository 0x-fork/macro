//! Outbound adapters implementing the domain ports.

#[cfg(feature = "http")]
mod drive_api_client;
#[cfg(feature = "http")]
pub use drive_api_client::DriveApiClient;

#[cfg(feature = "tokens")]
mod access_token_client;
#[cfg(feature = "tokens")]
pub use access_token_client::AuthServiceAccessTokens;

#[cfg(feature = "db")]
mod pg_google_drive_link_repo;
#[cfg(feature = "db")]
pub use pg_google_drive_link_repo::PgGoogleDriveLinkRepo;
