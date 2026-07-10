//! Read-only service (inbound port) for consuming stored ai projection
//! results, e.g. from the `GetProjection` AI tool. Split from
//! [`crate::domain::ai_projection_service::AiProjectionService`] so read-only
//! hosts don't need the queue, generator, and notifier ports.

use macro_user_id::user_id::MacroUserIdStr;

use crate::domain::{
    ai_projection_repo::AiProjectionRepository,
    model::{AiProjectionError, ProjectionStatus, TargetType},
};

/// A stored projection instance read on behalf of a user.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectionReadResult {
    /// The projection definition id.
    pub projection_id: String,
    /// The materialization status of the user's instance.
    pub status: ProjectionStatus,
    /// The cached result, if one has been materialized. May be present while
    /// `status` is `refreshing` (the previous result stays visible during
    /// regeneration).
    pub result: Option<String>,
    /// When the result was generated.
    pub generated_at: Option<chrono::DateTime<chrono::Utc>>,
    /// When the result becomes stale.
    pub stale_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Read access to a user's stored projection results.
pub trait AiProjectionReadService: Clone + Send + Sync + 'static {
    /// Reads the user's instance of the projection identified by
    /// `projection_id`. The target is always resolved from the authenticated
    /// user (their own id for `user` projections, their single team for `team`
    /// projections), so a caller can never read another target's instance.
    ///
    /// Returns [`AiProjectionError::NotFound`] when no such definition exists
    /// or the user has no instance of it.
    fn get_projection_for_user(
        &self,
        user_id: &MacroUserIdStr<'_>,
        projection_id: &str,
    ) -> impl Future<Output = Result<ProjectionReadResult, AiProjectionError>> + Send;
}

/// Implementation of [`AiProjectionReadService`] backed by an
/// [`AiProjectionRepository`].
#[derive(Debug, Clone)]
pub struct AiProjectionReadServiceImpl<R: AiProjectionRepository> {
    repository: R,
}

impl<R: AiProjectionRepository> AiProjectionReadServiceImpl<R> {
    /// Creates a new AiProjectionReadServiceImpl.
    pub fn new(repository: R) -> Self {
        Self { repository }
    }
}

impl<R: AiProjectionRepository> AiProjectionReadService for AiProjectionReadServiceImpl<R> {
    #[tracing::instrument(skip(self), err)]
    async fn get_projection_for_user(
        &self,
        user_id: &MacroUserIdStr<'_>,
        projection_id: &str,
    ) -> Result<ProjectionReadResult, AiProjectionError> {
        let projection = self.repository.get_projection(projection_id).await?;

        let target_id = match projection.target_type {
            TargetType::User => user_id.as_ref().to_string(),
            TargetType::Team => {
                let mut team_ids = self.repository.get_user_team_ids(user_id).await?;
                match team_ids.len() {
                    1 => team_ids.remove(0).to_string(),
                    0 => {
                        return Err(AiProjectionError::BadRequest(
                            "user is not a member of any team".to_string(),
                        ));
                    }
                    _ => {
                        return Err(AiProjectionError::BadRequest(
                            "user belongs to multiple teams; team target is ambiguous".to_string(),
                        ));
                    }
                }
            }
        };

        let instance = self
            .repository
            .get_target_projection(&projection.id, &target_id)
            .await?;

        Ok(ProjectionReadResult {
            projection_id: instance.ai_projection_id,
            status: instance.status,
            result: instance.result,
            generated_at: instance.generated_at,
            stale_at: instance.stale_at,
        })
    }
}
