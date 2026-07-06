//! Recipient resolution backed by the `entity_access` service.

use std::sync::Arc;

use entity_access::domain::ports::EntityAccessService;
use macro_user_id::user_id::MacroUserIdStr;

use crate::domain::models::ThreadParent;
use crate::domain::ports::ThreadRecipientResolver;

/// Resolves a thread parent's audience via
/// [`EntityAccessService::get_users_by_entity`]: channel parents resolve to
/// active participants, `entity_access`-backed parents (document, chat,
/// project, email thread) to every user with direct or inherited access.
#[derive(Clone)]
pub struct EntityAccessRecipientResolver<Svc> {
    access_service: Arc<Svc>,
}

impl<Svc> EntityAccessRecipientResolver<Svc> {
    /// Create a resolver over a shared entity access service.
    pub fn new(access_service: Arc<Svc>) -> Self {
        Self { access_service }
    }
}

impl<Svc> ThreadRecipientResolver for EntityAccessRecipientResolver<Svc>
where
    Svc: EntityAccessService,
{
    async fn recipients(
        &self,
        parent: &ThreadParent,
    ) -> Result<Vec<MacroUserIdStr<'static>>, anyhow::Error> {
        match self
            .access_service
            .get_users_by_entity(&parent.entity_id, parent.entity_type)
            .await
        {
            Ok(users) => Ok(users),
            // get_users_by_entity does not cover every parent type yet (CRM
            // entities resolve access via team joins). Degrade to no realtime
            // fan-out rather than failing the write.
            // TODO(unified-threads): teach get_users_by_entity about CRM
            // parents (team members of the owning team).
            Err(error) => {
                tracing::warn!(
                    ?error,
                    parent_type = parent.db_type(),
                    "unable to resolve thread recipients; skipping realtime fan-out"
                );
                Ok(vec![])
            }
        }
    }
}
