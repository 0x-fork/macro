//! Team-plan / toggle gate backed by the teams crate.

use teams::domain::team_repo::TeamRepository;

use crate::domain::{model::DocumentationAvailability, ports::DocumentationGate};

/// [`DocumentationGate`] that answers from the teams repository: the plan
/// requirement is satisfied by a team plan, active payment, or an
/// enterprise license; the toggle is the team's
/// `team_documentation_settings` row.
#[derive(Clone, Debug)]
pub struct TeamsDocumentationGate<TR> {
    team_repository: TR,
}

impl<TR: TeamRepository> TeamsDocumentationGate<TR> {
    /// Creates a new gate over the given teams repository.
    pub fn new(team_repository: TR) -> Self {
        Self { team_repository }
    }
}

impl<TR: TeamRepository> DocumentationGate for TeamsDocumentationGate<TR> {
    #[tracing::instrument(skip(self), err)]
    async fn availability(
        &self,
        team_id: &uuid::Uuid,
    ) -> Result<DocumentationAvailability, rootcause::Report> {
        let enabled = self
            .team_repository
            .get_team_documentation_enabled(team_id)
            .await
            .map_err(|e| rootcause::report!("reading documentation toggle: {e}"))?;

        // Short-circuits: the payment / enterprise lookups only run for
        // teams without a plan.
        let plan_ok = self
            .team_repository
            .get_team_plan(team_id)
            .await
            .map_err(|e| rootcause::report!("reading team plan: {e}"))?
            .is_some()
            || self
                .team_repository
                .get_team_payment_status(team_id)
                .await
                .map_err(|e| rootcause::report!("reading team payment status: {e}"))?
            || self
                .team_repository
                .get_team_enterprise_status(team_id)
                .await
                .map_err(|e| rootcause::report!("reading team enterprise status: {e}"))?;

        Ok(DocumentationAvailability { plan_ok, enabled })
    }
}
