mod delete;
mod get;
mod insert;

pub use delete::{delete_link_by_fusionauth_user_id, delete_link_by_id};
pub use get::{get_link_by_fusionauth_user_id, get_link_by_github_user_id, get_link_by_id};
pub use insert::create_github_link;

// Re-export GitHubLink from models for convenience
pub use crate::models::GitHubLink;
