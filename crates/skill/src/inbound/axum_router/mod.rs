//! Axum router for skill endpoints.
//!
//! Provides routes:
//! - `POST /skill/create_skill` — create and initialize a skill document

pub mod create_skill;

use std::sync::Arc;

use axum::{Router, extract::FromRef};
use entity_access::domain::ports::EntityAccessService;
use macro_authorization::{MacroAuthorizationService, MacroAuthorizationState};

use self::create_skill::create_skill_handler;
use crate::domain::ports::SkillCreationService;

/// Shared state for the skill router.
pub struct SkillRouterState<SkillSvc, ESvc, Auth> {
    /// The skill service implementation.
    pub service: Arc<SkillSvc>,
    /// The entity access service for authorization.
    pub access_service: Arc<ESvc>,
    /// State for request authorization.
    pub authorization_state: MacroAuthorizationState<Auth>,
}

impl<SkillSvc, ESvc, Auth> Clone for SkillRouterState<SkillSvc, ESvc, Auth>
where
    MacroAuthorizationState<Auth>: Clone,
{
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
            access_service: self.access_service.clone(),
            authorization_state: self.authorization_state.clone(),
        }
    }
}

impl<SkillSvc, ESvc, Auth> FromRef<SkillRouterState<SkillSvc, ESvc, Auth>> for Arc<ESvc> {
    fn from_ref(state: &SkillRouterState<SkillSvc, ESvc, Auth>) -> Self {
        state.access_service.clone()
    }
}

impl<SkillSvc, ESvc, Auth> FromRef<SkillRouterState<SkillSvc, ESvc, Auth>>
    for MacroAuthorizationState<Auth>
where
    MacroAuthorizationState<Auth>: Clone,
{
    fn from_ref(state: &SkillRouterState<SkillSvc, ESvc, Auth>) -> Self {
        state.authorization_state.clone()
    }
}

/// Build the skill router with all endpoints.
pub fn skill_router<SkillSvc, ESvc, Auth, S>(
    state: SkillRouterState<SkillSvc, ESvc, Auth>,
) -> Router<S>
where
    SkillSvc: SkillCreationService,
    ESvc: EntityAccessService,
    Auth: MacroAuthorizationService,
    MacroAuthorizationState<Auth>: Clone,
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route(
            "/create_skill",
            axum::routing::post(create_skill_handler::<SkillSvc, ESvc, Auth>),
        )
        .with_state(state)
}
