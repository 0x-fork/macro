use agent::AgentError;
use chrono::{DateTime, Utc};
use macro_user_id::user_id::MacroUserIdStr;
use macro_uuid::Uuid;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum MemoryError {
    #[error(transparent)]
    AgentError(#[from] AgentError),
    #[error("Nothing was generated")]
    NoGeneration,
    #[error("memory rejected by judge: {0}")]
    Rejected(String),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

pub type Result<T> = std::result::Result<T, MemoryError>;

pub type Memory = String;

/// A memory record with its latest refresh timestamp.
#[derive(Debug)]
pub struct MemoryRecord {
    /// The memory text.
    pub memory: Memory,
    /// When this memory was last generated or refreshed.
    pub updated_at: DateTime<Utc>,
}

pub trait MemoryRepo: Send + Sync + 'static {
    fn save_memory(
        &self,
        memory: &Memory,
        user: MacroUserIdStr,
    ) -> impl Future<Output = Result<Uuid>> + Send;
    fn get_latest_memory(
        &self,
        user: MacroUserIdStr,
    ) -> impl Future<Output = Result<Option<MemoryRecord>>> + Send;
    fn get_memory_by_id(
        &self,
        user: MacroUserIdStr,
        id: Uuid,
    ) -> impl Future<Output = Result<Memory>> + Send;
}

/// The memories available to a user: their own and their team's.
#[derive(Debug, Default)]
pub struct Memories {
    /// The user's personal memory.
    pub user: Option<Memory>,
    /// The latest memory of the team the user belongs to, if any.
    pub team: Option<Memory>,
}

pub trait MemoryService: Send + Sync + 'static {
    /// Get the user's personal memory and the memory of their team, triggering
    /// background regeneration of whichever is stale or missing.
    fn get_or_generate_memory(
        &self,
        user: MacroUserIdStr<'static>,
    ) -> impl Future<Output = Result<Memories>> + Send;
}

/// A snapshot of team data used to ground team memory generation.
#[derive(Debug)]
pub struct TeamOverview {
    /// The team's display name.
    pub name: String,
    /// Macro user ids of the team's members.
    pub member_ids: Vec<String>,
}

pub trait TeamMemoryRepo: Send + Sync + 'static {
    fn save_team_memory(
        &self,
        memory: &Memory,
        team_id: Uuid,
    ) -> impl Future<Output = Result<Uuid>> + Send;
    fn get_latest_team_memory(
        &self,
        team_id: Uuid,
    ) -> impl Future<Output = Result<Option<MemoryRecord>>> + Send;
    fn get_team_memory_by_id(
        &self,
        team_id: Uuid,
        id: Uuid,
    ) -> impl Future<Output = Result<Memory>> + Send;
    /// Resolve the team the user belongs to, if any.
    fn get_user_team_id(
        &self,
        user: MacroUserIdStr,
    ) -> impl Future<Output = Result<Option<Uuid>>> + Send;
    /// Fetch the team's name and member list, or `None` if the team does not exist.
    fn get_team_overview(
        &self,
        team_id: Uuid,
    ) -> impl Future<Output = Result<Option<TeamOverview>>> + Send;
}
