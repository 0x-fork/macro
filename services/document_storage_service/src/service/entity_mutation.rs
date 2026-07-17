//! Document-storage composition of the unified entity mutation domain port.
//!
//! This service dispatches capability-oriented operations to existing domain
//! services. Legacy project/document lifecycle orchestration is isolated
//! behind [`LegacyEntityMutationService`]; GraphQL never calls a REST handler
//! or database adapter directly.

use std::{collections::HashSet, future::Future, sync::Arc};

use call::domain::{
    models::{CallError, EditCallRecordRequest},
    ports::CallService,
};
use channels::domain::{
    models::{PatchChannelRequest, Sender},
    ports::{ChannelMutationErr, ChannelService},
};
use chat::domain::{
    models::{ChatErr, PatchChatArgs},
    ports::ChatService,
};
use documents_hex::domain::{
    models::{DocumentError, EditDocumentServiceArgs},
    ports::DocumentService,
};
use email::domain::{models::EmailErr, ports::EmailService};
use entity_access::domain::{
    models::{
        AccessError, AdminParticipantRole, EditAccessLevel, EntityAccessReceipt, OwnerAccessLevel,
        OwnerParticipantRole, RequiredPermission, ViewAccessLevel,
    },
    ports::EntityAccessService,
};
use entity_mutation::{
    DuplicateEntityRequest, EntityMutationActor, EntityMutationError, EntityMutationErrorCode,
    EntityMutationOutcome, EntityMutationService, EntityRef, MoveEntityRequest,
    RenameEntityRequest, UpdateEntitySharePolicyRequest,
};
use favorites::domain::{models::FavoritesError, ports::FavoritesService};
use futures::{StreamExt, stream};
use model_entity::EntityType;
use unicode_segmentation::UnicodeSegmentation;
use uuid::Uuid;

#[cfg(test)]
mod test;

const MAX_CONCURRENT_ENTITY_MUTATIONS: usize = 16;

/// Error returned by the legacy lifecycle port.
pub enum LegacyEntityMutationError {
    /// The requested entity does not exist.
    NotFound,
    /// The request violates an input invariant.
    InvalidInput(String),
    /// Infrastructure or persistence failed.
    Internal(rootcause::Report),
}

/// Persistence state needed to enforce project mutation invariants.
pub struct ProjectMutationState {
    /// Whether the project is currently soft-deleted.
    pub deleted: bool,
}

/// Extracted project/document lifecycle capabilities still backed by legacy
/// persistence adapters.
#[async_trait::async_trait]
pub trait LegacyEntityMutationService: Send + Sync + 'static {
    /// Load the project state required by application policy.
    async fn project_state(
        &self,
        entity: &EntityRef,
    ) -> Result<ProjectMutationState, LegacyEntityMutationError>;
    /// Determine whether assigning `project_id` would create a cycle.
    async fn project_move_would_cycle(
        &self,
        entity: &EntityRef,
        project_id: &str,
    ) -> Result<bool, LegacyEntityMutationError>;
    /// Rename a project.
    async fn rename_project(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
        display_name: String,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError>;
    /// Move a project to a parent or root.
    async fn move_project(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
        project_id: Option<String>,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError>;
    /// Update a project's share policy.
    async fn update_project_share_policy(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
        policy: models_permissions::share_permission::UpdateSharePermissionRequestV2,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError>;
    /// Soft-delete a project tree.
    async fn trash_project(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError>;
    /// Restore a project tree.
    async fn restore_project(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError>;
    /// Permanently delete a project tree.
    async fn delete_project_permanently(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError>;
    /// Restore a document.
    async fn restore_document(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError>;
    /// Permanently delete a document.
    async fn delete_document_permanently(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError>;
}

async fn collect_ordered<F>(futures: impl IntoIterator<Item = F>) -> Vec<EntityMutationOutcome>
where
    F: Future<Output = EntityMutationOutcome>,
{
    stream::iter(futures)
        .buffered(MAX_CONCURRENT_ENTITY_MUTATIONS)
        .collect()
        .await
}

/// Unified entity mutation service wired from the existing domain services.
#[derive(Clone)]
pub struct DssEntityMutationService<D, H, C, K, E, A, F, L> {
    documents: Arc<D>,
    chats: Arc<H>,
    channels: Arc<C>,
    calls: Arc<K>,
    email: Arc<E>,
    access: Arc<A>,
    favorites: Arc<F>,
    legacy: Arc<L>,
}

impl<D, H, C, K, E, A, F, L> DssEntityMutationService<D, H, C, K, E, A, F, L> {
    /// Compose the unified mutation service from domain services.
    pub fn new(
        documents: Arc<D>,
        chats: Arc<H>,
        channels: Arc<C>,
        calls: Arc<K>,
        email: Arc<E>,
        access: Arc<A>,
        favorites: Arc<F>,
        legacy: Arc<L>,
    ) -> Self {
        Self {
            documents,
            chats,
            channels,
            calls,
            email,
            access,
            favorites,
            legacy,
        }
    }
}

fn legacy_outcome(
    requested: EntityRef,
    result: Result<Vec<EntityRef>, LegacyEntityMutationError>,
) -> EntityMutationOutcome {
    match result {
        Ok(mut affected) => {
            if !affected.contains(&requested) {
                affected.insert(0, requested.clone());
            }
            EntityMutationOutcome::success_with(requested.clone(), Some(requested), affected)
        }
        Err(LegacyEntityMutationError::NotFound) => EntityMutationOutcome::failure(
            requested,
            EntityMutationError::new(EntityMutationErrorCode::NotFound, "entity not found"),
        ),
        Err(LegacyEntityMutationError::InvalidInput(message)) => invalid_input(requested, message),
        Err(LegacyEntityMutationError::Internal(error)) => internal_failure(requested, error),
    }
}

impl<D, H, C, K, E, A, F, L> DssEntityMutationService<D, H, C, K, E, A, F, L>
where
    D: DocumentService,
    H: ChatService,
    C: ChannelService,
    K: CallService,
    E: EmailService,
    A: EntityAccessService,
    F: FavoritesService,
    L: LegacyEntityMutationService,
{
    async fn receipt<T: RequiredPermission>(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<EntityAccessReceipt<T>, EntityMutationOutcome> {
        self.access
            .generate_entity_access_receipt::<T>(
                &actor.user_id,
                actor.organization_id,
                &entity.entity_id,
                entity.entity_type,
            )
            .await
            .map_err(|error| access_failure(entity.clone(), error))
    }

    async fn require_target_project(
        &self,
        actor: &EntityMutationActor,
        project_id: Option<&str>,
    ) -> Result<Option<EntityAccessReceipt<EditAccessLevel>>, EntityMutationOutcome> {
        let Some(project_id) = project_id else {
            return Ok(None);
        };
        let project = EntityRef::new(EntityType::Project, project_id);
        self.receipt::<EditAccessLevel>(actor, &project)
            .await
            .map(Some)
    }

    async fn chat_project_id(
        &self,
        requested: &EntityRef,
        owner_receipt: &EntityAccessReceipt<OwnerAccessLevel>,
    ) -> Result<Option<String>, EntityMutationOutcome> {
        let view_receipt = owner_receipt
            .clone()
            .try_into_requirement::<ViewAccessLevel>()
            .map_err(|error| access_failure(requested.clone(), error))?;
        self.chats
            .get_metadata(view_receipt)
            .await
            .map(|chat| chat.project_id)
            .map_err(|error| chat_failure(requested.clone(), error))
    }

    async fn require_archived_call(
        &self,
        requested: &EntityRef,
        edit_receipt: &EntityAccessReceipt<EditAccessLevel>,
        operation: &str,
    ) -> Result<(), EntityMutationOutcome> {
        let view_receipt = edit_receipt
            .clone()
            .try_into_requirement::<ViewAccessLevel>()
            .map_err(|error| access_failure(requested.clone(), error))?;
        let call = self
            .calls
            .get_call_record(view_receipt)
            .await
            .map_err(|error| call_failure(requested.clone(), error))?;
        if call.is_active {
            return Err(state_conflict(
                requested.clone(),
                format!("cannot {operation} an active call"),
            ));
        }
        Ok(())
    }

    async fn rename_one(
        &self,
        actor: EntityMutationActor,
        request: RenameEntityRequest,
    ) -> EntityMutationOutcome {
        let requested = request.entity;
        match requested.entity_type {
            EntityType::Document => {
                let receipt = match self.receipt::<EditAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                let document = match self
                    .documents
                    .internal_get_basic_document(&requested.entity_id)
                    .await
                {
                    Ok(document) => document,
                    Err(error) => return document_failure(requested, error),
                };
                if document.deleted_at.is_some() {
                    return state_conflict(requested, "cannot rename a deleted document");
                }
                match self
                    .documents
                    .edit_document(
                        receipt,
                        document,
                        EditDocumentServiceArgs {
                            document_name: Some(request.display_name),
                            project_id: None,
                            share_permission: None,
                            file_type: None,
                        },
                    )
                    .await
                {
                    Ok(()) => EntityMutationOutcome::success(requested),
                    Err(error) => document_failure(requested, error),
                }
            }
            EntityType::Chat => {
                let receipt = match self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                match self
                    .chats
                    .patch(
                        receipt,
                        PatchChatArgs {
                            name: Some(request.display_name),
                            project_id: None,
                            share_permission: None,
                        },
                    )
                    .await
                {
                    Ok(()) => EntityMutationOutcome::success(requested),
                    Err(error) => chat_failure(requested, error),
                }
            }
            EntityType::Channel => {
                let receipt = match self
                    .receipt::<AdminParticipantRole>(&actor, &requested)
                    .await
                {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                let channel_id = match parse_uuid(&requested) {
                    Ok(id) => id,
                    Err(outcome) => return outcome,
                };
                let sender = match sender_from_receipt(&requested, receipt) {
                    Ok(sender) => sender,
                    Err(outcome) => return outcome,
                };
                match self
                    .channels
                    .patch_channel(
                        sender,
                        channel_id,
                        PatchChannelRequest {
                            channel_name: Some(request.display_name),
                        },
                    )
                    .await
                {
                    Ok(()) => EntityMutationOutcome::success(requested),
                    Err(error) => channel_failure(requested, error),
                }
            }
            EntityType::Call => {
                let receipt = match self.receipt::<EditAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                if let Err(outcome) = self
                    .require_archived_call(&requested, &receipt, "rename")
                    .await
                {
                    return outcome;
                }
                match self
                    .calls
                    .edit_call_record(
                        receipt,
                        EditCallRecordRequest {
                            share_permission: None,
                            share_with_team: None,
                            custom_name: Some(request.display_name),
                        },
                    )
                    .await
                {
                    Ok(()) => EntityMutationOutcome::success(requested),
                    Err(error) => call_failure(requested, error),
                }
            }
            EntityType::Project => {
                if let Err(outcome) = self.receipt::<EditAccessLevel>(&actor, &requested).await {
                    return outcome;
                }
                let state = match self.legacy.project_state(&requested).await {
                    Ok(state) => state,
                    Err(error) => return legacy_outcome(requested, Err(error)),
                };
                if state.deleted {
                    return state_conflict(requested, "cannot rename a deleted project");
                }
                if request.display_name.graphemes(true).count() > 100 {
                    return invalid_input(requested, "project name exceeds 100 characters");
                }
                let result = self
                    .legacy
                    .rename_project(&actor, &requested, request.display_name)
                    .await;
                legacy_outcome(requested, result)
            }
            _ => EntityMutationOutcome::unsupported(requested, "rename"),
        }
    }

    async fn move_one(
        &self,
        actor: EntityMutationActor,
        request: MoveEntityRequest,
    ) -> EntityMutationOutcome {
        let requested = request.entity;
        let project_id = request.project_id;
        match requested.entity_type {
            EntityType::Document => {
                let receipt = match self.receipt::<EditAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                let document = match self
                    .documents
                    .internal_get_basic_document(&requested.entity_id)
                    .await
                {
                    Ok(document) => document,
                    Err(error) => return document_failure(requested, error),
                };
                if document.deleted_at.is_some() {
                    return state_conflict(requested, "cannot move a deleted document");
                }
                let old_project_id = document.project_id.clone().map(|id| id.to_string());
                if let Err(outcome) = self
                    .require_target_project(&actor, project_id.as_deref())
                    .await
                {
                    return EntityMutationOutcome::failure(
                        requested,
                        outcome
                            .error
                            .expect("target project failure must include an error"),
                    );
                }
                match self
                    .documents
                    .edit_document(
                        receipt,
                        document,
                        EditDocumentServiceArgs {
                            document_name: None,
                            project_id: Some(project_id.clone().unwrap_or_default()),
                            share_permission: None,
                            file_type: None,
                        },
                    )
                    .await
                {
                    Ok(()) => {
                        success_with_projects(requested, [old_project_id, project_id.clone()])
                    }
                    Err(error) => document_failure(requested, error),
                }
            }
            EntityType::Chat => {
                let receipt = match self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                let old_project_id = match self.chat_project_id(&requested, &receipt).await {
                    Ok(project_id) => project_id,
                    Err(outcome) => return outcome,
                };
                if let Err(outcome) = self
                    .require_target_project(&actor, project_id.as_deref())
                    .await
                {
                    return EntityMutationOutcome::failure(
                        requested,
                        outcome
                            .error
                            .expect("target project failure must include an error"),
                    );
                }
                match self
                    .chats
                    .patch(
                        receipt,
                        PatchChatArgs {
                            name: None,
                            project_id: Some(project_id.clone().unwrap_or_default()),
                            share_permission: None,
                        },
                    )
                    .await
                {
                    Ok(()) => {
                        success_with_projects(requested, [old_project_id, project_id.clone()])
                    }
                    Err(error) => chat_failure(requested, error),
                }
            }
            EntityType::EmailThread => {
                let receipt = match self.receipt::<EditAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                let project_receipt = match self
                    .require_target_project(&actor, project_id.as_deref())
                    .await
                {
                    Ok(receipt) => receipt,
                    Err(outcome) => {
                        return EntityMutationOutcome::failure(
                            requested,
                            outcome
                                .error
                                .expect("target project failure must include an error"),
                        );
                    }
                };
                match self
                    .email
                    .update_thread_project(receipt, project_receipt)
                    .await
                {
                    Ok(old_project_id) => {
                        success_with_projects(requested, [old_project_id, project_id.clone()])
                    }
                    Err(error) => email_failure(requested, error),
                }
            }
            EntityType::Project => {
                if let Err(outcome) = self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    return outcome;
                }
                if let Err(outcome) = self
                    .require_target_project(&actor, project_id.as_deref())
                    .await
                {
                    return EntityMutationOutcome::failure(
                        requested,
                        outcome
                            .error
                            .expect("target project failure must include an error"),
                    );
                }
                let state = match self.legacy.project_state(&requested).await {
                    Ok(state) => state,
                    Err(error) => return legacy_outcome(requested, Err(error)),
                };
                if state.deleted {
                    return state_conflict(requested, "cannot move a deleted project");
                }
                if project_id.as_deref() == Some(requested.entity_id.as_str()) {
                    return invalid_input(requested, "project cannot be its own parent");
                }
                if let Some(parent_id) = project_id.as_deref() {
                    match self
                        .legacy
                        .project_move_would_cycle(&requested, parent_id)
                        .await
                    {
                        Ok(true) => {
                            return invalid_input(requested, "project move would create a cycle");
                        }
                        Ok(false) => {}
                        Err(error) => return legacy_outcome(requested, Err(error)),
                    }
                }
                let result = self
                    .legacy
                    .move_project(&actor, &requested, project_id)
                    .await;
                legacy_outcome(requested, result)
            }
            _ => EntityMutationOutcome::unsupported(requested, "move"),
        }
    }

    async fn update_share_policy_one(
        &self,
        actor: EntityMutationActor,
        request: UpdateEntitySharePolicyRequest,
    ) -> EntityMutationOutcome {
        let requested = request.entity;
        match requested.entity_type {
            EntityType::Document => {
                let receipt = match self.receipt::<EditAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                let document = match self
                    .documents
                    .internal_get_basic_document(&requested.entity_id)
                    .await
                {
                    Ok(document) => document,
                    Err(error) => return document_failure(requested, error),
                };
                if document.deleted_at.is_some() {
                    return state_conflict(
                        requested,
                        "cannot update sharing for a deleted document",
                    );
                }
                match self
                    .documents
                    .edit_document(
                        receipt,
                        document,
                        EditDocumentServiceArgs {
                            document_name: None,
                            project_id: None,
                            share_permission: Some(request.policy),
                            file_type: None,
                        },
                    )
                    .await
                {
                    Ok(()) => EntityMutationOutcome::success(requested),
                    Err(error) => document_failure(requested, error),
                }
            }
            EntityType::Chat => {
                let receipt = match self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                match self
                    .chats
                    .patch(
                        receipt,
                        PatchChatArgs {
                            name: None,
                            project_id: None,
                            share_permission: Some(request.policy),
                        },
                    )
                    .await
                {
                    Ok(()) => EntityMutationOutcome::success(requested),
                    Err(error) => chat_failure(requested, error),
                }
            }
            EntityType::Call => {
                let receipt = match self.receipt::<EditAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                match self
                    .calls
                    .edit_call_record(
                        receipt,
                        EditCallRecordRequest {
                            share_permission: Some(request.policy),
                            share_with_team: None,
                            custom_name: None,
                        },
                    )
                    .await
                {
                    Ok(()) => EntityMutationOutcome::success(requested),
                    Err(error) => call_failure(requested, error),
                }
            }
            EntityType::Project => {
                if let Err(outcome) = self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    return outcome;
                }
                let state = match self.legacy.project_state(&requested).await {
                    Ok(state) => state,
                    Err(error) => return legacy_outcome(requested, Err(error)),
                };
                if state.deleted {
                    return state_conflict(
                        requested,
                        "cannot update sharing for a deleted project",
                    );
                }
                let result = self
                    .legacy
                    .update_project_share_policy(&actor, &requested, request.policy)
                    .await;
                legacy_outcome(requested, result)
            }
            _ => EntityMutationOutcome::unsupported(requested, "share policy updates"),
        }
    }

    async fn trash_one(
        &self,
        actor: EntityMutationActor,
        requested: EntityRef,
    ) -> EntityMutationOutcome {
        match requested.entity_type {
            EntityType::Document => {
                let receipt = match self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                let project_id = match self
                    .documents
                    .internal_get_basic_document(&requested.entity_id)
                    .await
                {
                    Ok(document) => document.project_id,
                    Err(error) => return document_failure(requested, error),
                };
                let affected_project_id = project_id.clone().map(|id| id.to_string());
                match self.documents.delete_document(receipt, project_id).await {
                    Ok(()) => success_with_projects(requested, [affected_project_id]),
                    Err(error) => document_failure(requested, error),
                }
            }
            EntityType::Chat => {
                let receipt = match self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                let project_id = match self.chat_project_id(&requested, &receipt).await {
                    Ok(project_id) => project_id,
                    Err(outcome) => return outcome,
                };
                match self.chats.delete(receipt).await {
                    Ok(()) => success_with_projects(requested, [project_id]),
                    Err(error) => chat_failure(requested, error),
                }
            }
            EntityType::Project => {
                if let Err(outcome) = self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    return outcome;
                }
                let result = self.legacy.trash_project(&actor, &requested).await;
                legacy_outcome(requested, result)
            }
            _ => EntityMutationOutcome::unsupported(requested, "trash"),
        }
    }

    async fn restore_one(
        &self,
        actor: EntityMutationActor,
        requested: EntityRef,
    ) -> EntityMutationOutcome {
        match requested.entity_type {
            EntityType::Document => {
                if let Err(outcome) = self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    return outcome;
                }
                let result = self.legacy.restore_document(&actor, &requested).await;
                legacy_outcome(requested, result)
            }
            EntityType::Chat => {
                let receipt = match self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                let project_id = match self.chat_project_id(&requested, &receipt).await {
                    Ok(project_id) => project_id,
                    Err(outcome) => return outcome,
                };
                match self.chats.revert_delete(receipt).await {
                    Ok(()) => success_with_projects(requested, [project_id]),
                    Err(error) => chat_failure(requested, error),
                }
            }
            EntityType::Project => {
                if let Err(outcome) = self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    return outcome;
                }
                let result = self.legacy.restore_project(&actor, &requested).await;
                legacy_outcome(requested, result)
            }
            _ => EntityMutationOutcome::unsupported(requested, "restore"),
        }
    }

    async fn delete_permanently_one(
        &self,
        actor: EntityMutationActor,
        requested: EntityRef,
    ) -> EntityMutationOutcome {
        match requested.entity_type {
            EntityType::Document => {
                if let Err(outcome) = self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    return outcome;
                }
                let result = self
                    .legacy
                    .delete_document_permanently(&actor, &requested)
                    .await;
                legacy_outcome(requested, result)
            }
            EntityType::Chat => {
                let receipt = match self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                let project_id = match self.chat_project_id(&requested, &receipt).await {
                    Ok(project_id) => project_id,
                    Err(outcome) => return outcome,
                };
                match self.chats.permanently_delete(receipt).await {
                    Ok(()) => success_with_projects(requested, [project_id]),
                    Err(error) => chat_failure(requested, error),
                }
            }
            EntityType::Channel => {
                let receipt = match self
                    .receipt::<OwnerParticipantRole>(&actor, &requested)
                    .await
                {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                let channel_id = match parse_uuid(&requested) {
                    Ok(id) => id,
                    Err(outcome) => return outcome,
                };
                let sender = sender_from_receipt(&requested, receipt);
                match sender {
                    Ok(sender) => match self.channels.delete_channel(sender, channel_id).await {
                        Ok(()) => EntityMutationOutcome::success(requested),
                        Err(error) => channel_failure(requested, error),
                    },
                    Err(outcome) => outcome,
                }
            }
            EntityType::Call => {
                let receipt = match self.receipt::<EditAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                if let Err(outcome) = self
                    .require_archived_call(&requested, &receipt, "permanently delete")
                    .await
                {
                    return outcome;
                }
                match self.calls.delete_call_record(receipt).await {
                    Ok(()) => EntityMutationOutcome::success(requested),
                    Err(error) => call_failure(requested, error),
                }
            }
            EntityType::Project => {
                if let Err(outcome) = self.receipt::<OwnerAccessLevel>(&actor, &requested).await {
                    return outcome;
                }
                let result = self
                    .legacy
                    .delete_project_permanently(&actor, &requested)
                    .await;
                legacy_outcome(requested, result)
            }
            _ => EntityMutationOutcome::unsupported(requested, "permanent deletion"),
        }
    }

    async fn duplicate_one(
        &self,
        actor: EntityMutationActor,
        request: DuplicateEntityRequest,
    ) -> EntityMutationOutcome {
        let requested = request.entity;
        match requested.entity_type {
            EntityType::Document => {
                let receipt = match self.receipt::<ViewAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                let document = match self
                    .documents
                    .internal_get_basic_document(&requested.entity_id)
                    .await
                {
                    Ok(document) => document,
                    Err(error) => return document_failure(requested, error),
                };
                let display_name = request
                    .display_name
                    .unwrap_or_else(|| format!("{} copy", document.document_name));
                match self
                    .documents
                    .copy_document(receipt, document, actor.user_id, display_name, None, None)
                    .await
                {
                    Ok(response) => {
                        let created = EntityRef::new(
                            EntityType::Document,
                            response.document_metadata.metadata.document_id,
                        );
                        EntityMutationOutcome::success_with(
                            requested,
                            Some(created.clone()),
                            vec![created],
                        )
                    }
                    Err(error) => document_failure(requested, error),
                }
            }
            EntityType::Chat => {
                if request.display_name.is_some() {
                    return invalid_input(
                        requested,
                        "chat duplication does not yet accept a custom display name",
                    );
                }
                let receipt = match self.receipt::<ViewAccessLevel>(&actor, &requested).await {
                    Ok(receipt) => receipt,
                    Err(outcome) => return outcome,
                };
                match self.chats.copy_chat(receipt).await {
                    Ok(id) => {
                        let created = EntityRef::new(EntityType::Chat, id);
                        EntityMutationOutcome::success_with(
                            requested,
                            Some(created.clone()),
                            vec![created],
                        )
                    }
                    Err(error) => chat_failure(requested, error),
                }
            }
            _ => EntityMutationOutcome::unsupported(requested, "duplication"),
        }
    }
}

#[async_trait::async_trait]
impl<D, H, C, K, E, A, F, L> EntityMutationService
    for DssEntityMutationService<D, H, C, K, E, A, F, L>
where
    D: DocumentService,
    H: ChatService,
    C: ChannelService,
    K: CallService,
    E: EmailService,
    A: EntityAccessService,
    F: FavoritesService,
    L: LegacyEntityMutationService,
{
    async fn rename_entities(
        &self,
        actor: EntityMutationActor,
        requests: Vec<RenameEntityRequest>,
    ) -> Vec<EntityMutationOutcome> {
        collect_ordered(
            requests
                .into_iter()
                .map(|request| self.rename_one(actor.clone(), request)),
        )
        .await
    }

    async fn move_entities(
        &self,
        actor: EntityMutationActor,
        requests: Vec<MoveEntityRequest>,
    ) -> Vec<EntityMutationOutcome> {
        collect_ordered(
            requests
                .into_iter()
                .map(|request| self.move_one(actor.clone(), request)),
        )
        .await
    }

    async fn update_share_policies(
        &self,
        actor: EntityMutationActor,
        requests: Vec<UpdateEntitySharePolicyRequest>,
    ) -> Vec<EntityMutationOutcome> {
        collect_ordered(
            requests
                .into_iter()
                .map(|request| self.update_share_policy_one(actor.clone(), request)),
        )
        .await
    }

    async fn trash_entities(
        &self,
        actor: EntityMutationActor,
        entities: Vec<EntityRef>,
    ) -> Vec<EntityMutationOutcome> {
        collect_ordered(
            entities
                .into_iter()
                .map(|entity| self.trash_one(actor.clone(), entity)),
        )
        .await
    }

    async fn restore_entities(
        &self,
        actor: EntityMutationActor,
        entities: Vec<EntityRef>,
    ) -> Vec<EntityMutationOutcome> {
        collect_ordered(
            entities
                .into_iter()
                .map(|entity| self.restore_one(actor.clone(), entity)),
        )
        .await
    }

    async fn delete_entities_permanently(
        &self,
        actor: EntityMutationActor,
        entities: Vec<EntityRef>,
    ) -> Vec<EntityMutationOutcome> {
        collect_ordered(
            entities
                .into_iter()
                .map(|entity| self.delete_permanently_one(actor.clone(), entity)),
        )
        .await
    }

    async fn duplicate_entities(
        &self,
        actor: EntityMutationActor,
        requests: Vec<DuplicateEntityRequest>,
    ) -> Vec<EntityMutationOutcome> {
        collect_ordered(
            requests
                .into_iter()
                .map(|request| self.duplicate_one(actor.clone(), request)),
        )
        .await
    }

    async fn set_favorite(
        &self,
        actor: EntityMutationActor,
        entity: EntityRef,
        favorite: bool,
    ) -> EntityMutationOutcome {
        if matches!(
            entity.entity_type,
            EntityType::Team | EntityType::User | EntityType::ChannelMessage
        ) {
            return EntityMutationOutcome::unsupported(entity, "favorites");
        }
        if favorite {
            let visibility = if entity.entity_type == EntityType::StaticFile {
                match self
                    .access
                    .get_access_level(Some(&actor.user_id), &entity.entity_id, entity.entity_type)
                    .await
                {
                    Ok(Some(_)) => Ok(()),
                    Ok(None) => Err(AccessError::Unauthorized),
                    Err(error) => Err(error),
                }
            } else {
                self.access
                    .get_entity_permission(
                        Some(&actor.user_id),
                        &entity.entity_id,
                        entity.entity_type,
                        actor.organization_id,
                    )
                    .await
                    .map(|_| ())
            };
            if let Err(error) = visibility {
                return access_failure(entity, error);
            }
        }

        let domain_entity = entity
            .entity_type
            .with_entity_str(entity.entity_id.as_str());
        let result = if favorite {
            self.favorites
                .add_favorite(&actor.user_id, &domain_entity)
                .await
                .map(|_| ())
        } else {
            self.favorites
                .remove_favorite_by_entity(&actor.user_id, &domain_entity)
                .await
        };
        match result {
            Ok(()) => EntityMutationOutcome::success(entity),
            Err(error) => favorite_failure(entity, error),
        }
    }

    async fn reorder_favorites(
        &self,
        actor: EntityMutationActor,
        entities: Vec<EntityRef>,
    ) -> Vec<EntityMutationOutcome> {
        let domain_entities = entities
            .iter()
            .map(|entity| {
                entity
                    .entity_type
                    .with_entity_string(entity.entity_id.clone())
            })
            .collect::<Vec<_>>();
        match self
            .favorites
            .reorder_favorites(&actor.user_id, &domain_entities)
            .await
        {
            Ok(()) => entities
                .into_iter()
                .map(EntityMutationOutcome::success)
                .collect(),
            Err(error) => entities
                .into_iter()
                .map(|entity| favorite_failure(entity, favorite_error_clone(&error)))
                .collect(),
        }
    }
}

fn parse_uuid(entity: &EntityRef) -> Result<Uuid, EntityMutationOutcome> {
    Uuid::parse_str(&entity.entity_id)
        .map_err(|_| invalid_input(entity.clone(), "entity id must be a UUID"))
}

fn success_with_projects(
    requested: EntityRef,
    project_ids: impl IntoIterator<Item = Option<String>>,
) -> EntityMutationOutcome {
    let mut affected_entities = vec![requested.clone()];
    let mut seen = HashSet::new();
    for project_id in project_ids.into_iter().flatten() {
        if !project_id.is_empty() && seen.insert(project_id.clone()) {
            affected_entities.push(EntityRef::new(EntityType::Project, project_id));
        }
    }
    EntityMutationOutcome::success_with(requested.clone(), Some(requested), affected_entities)
}

fn sender_from_receipt<T: RequiredPermission>(
    requested: &EntityRef,
    receipt: EntityAccessReceipt<T>,
) -> Result<Sender, EntityMutationOutcome> {
    receipt
        .get_authenticated_user()
        .cloned()
        .map(Sender::new_from_user)
        .map_err(|_| forbidden(requested.clone(), "authenticated user required"))
}

fn failure(
    entity: EntityRef,
    code: EntityMutationErrorCode,
    message: impl Into<String>,
) -> EntityMutationOutcome {
    EntityMutationOutcome::failure(entity, EntityMutationError::new(code, message))
}

fn invalid_input(entity: EntityRef, message: impl Into<String>) -> EntityMutationOutcome {
    failure(entity, EntityMutationErrorCode::InvalidInput, message)
}

fn forbidden(entity: EntityRef, message: impl Into<String>) -> EntityMutationOutcome {
    failure(entity, EntityMutationErrorCode::Forbidden, message)
}

fn state_conflict(entity: EntityRef, message: impl Into<String>) -> EntityMutationOutcome {
    failure(entity, EntityMutationErrorCode::Conflict, message)
}

fn internal_failure(entity: EntityRef, error: impl std::fmt::Debug) -> EntityMutationOutcome {
    tracing::error!(error=?error, entity_type=%entity.entity_type, entity_id=%entity.entity_id, "unified entity mutation failed");
    failure(
        entity,
        EntityMutationErrorCode::Internal,
        "entity mutation failed",
    )
}

fn access_failure(entity: EntityRef, error: AccessError) -> EntityMutationOutcome {
    match error {
        AccessError::Unauthorized | AccessError::UnauthorizedWithMessage(_) => {
            forbidden(entity, "insufficient permission for entity mutation")
        }
        AccessError::NotFound(_) => failure(
            entity,
            EntityMutationErrorCode::NotFound,
            "entity not found",
        ),
        AccessError::BadRequest(message) => invalid_input(entity, message),
        error @ (AccessError::DatabaseError(_) | AccessError::Internal) => {
            internal_failure(entity, error)
        }
    }
}

fn document_failure(entity: EntityRef, error: DocumentError) -> EntityMutationOutcome {
    match error {
        DocumentError::NotFound(_) | DocumentError::Gone => failure(
            entity,
            EntityMutationErrorCode::NotFound,
            "document not found",
        ),
        DocumentError::Unauthorized => forbidden(entity, "insufficient document permission"),
        DocumentError::Conflict(message) => state_conflict(entity, message),
        DocumentError::BadRequest(message) => invalid_input(entity, message),
        DocumentError::NameTooLong { max } => {
            invalid_input(entity, format!("display name exceeds {max} characters"))
        }
        error => internal_failure(entity, error),
    }
}

fn chat_failure(entity: EntityRef, error: ChatErr) -> EntityMutationOutcome {
    match error {
        ChatErr::NotFound => failure(entity, EntityMutationErrorCode::NotFound, "chat not found"),
        ChatErr::BadRequest(message) => invalid_input(entity, message),
        ChatErr::Access(error) => access_failure(entity, error),
        error @ ChatErr::Unknown(_) => internal_failure(entity, error),
    }
}

fn channel_failure(entity: EntityRef, error: ChannelMutationErr) -> EntityMutationOutcome {
    match error {
        ChannelMutationErr::BadRequest(message) => invalid_input(entity, message),
        ChannelMutationErr::Unauthorized(_) => forbidden(entity, "insufficient channel role"),
        ChannelMutationErr::NotFound(_) => failure(
            entity,
            EntityMutationErrorCode::NotFound,
            "channel not found",
        ),
        error => internal_failure(entity, error),
    }
}

fn call_failure(entity: EntityRef, error: CallError) -> EntityMutationOutcome {
    match error {
        CallError::NotFound(_) => {
            failure(entity, EntityMutationErrorCode::NotFound, "call not found")
        }
        CallError::Auth | CallError::NotInCall => forbidden(entity, "insufficient call permission"),
        CallError::InvalidRequest(message) => invalid_input(entity, message),
        CallError::AlreadyInCall(_) => state_conflict(entity, error.to_string()),
        error @ CallError::Internal(_) => internal_failure(entity, error),
    }
}

fn email_failure(entity: EntityRef, error: EmailErr) -> EntityMutationOutcome {
    match error {
        EmailErr::ThreadNotFound => failure(
            entity,
            EntityMutationErrorCode::NotFound,
            "email thread not found",
        ),
        EmailErr::Unauthorized => forbidden(entity, "insufficient email thread permission"),
        error => internal_failure(entity, error),
    }
}

fn favorite_failure(entity: EntityRef, error: FavoritesError) -> EntityMutationOutcome {
    match error {
        FavoritesError::NotFound => failure(
            entity,
            EntityMutationErrorCode::NotFound,
            "favorite not found",
        ),
        FavoritesError::BadRequest(message) => invalid_input(entity, message),
        error @ FavoritesError::Internal(_) => internal_failure(entity, error),
    }
}

fn favorite_error_clone(error: &FavoritesError) -> FavoritesError {
    match error {
        FavoritesError::NotFound => FavoritesError::NotFound,
        FavoritesError::BadRequest(message) => FavoritesError::BadRequest(message.clone()),
        FavoritesError::Internal(error) => {
            FavoritesError::Internal(anyhow::anyhow!(error.to_string()))
        }
    }
}
