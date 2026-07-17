//! Document-storage composition of the unified entity mutation domain port.
//!
//! Each capability dispatches to the domain service that owns the entity
//! kind. The per-kind support matrix is encoded as exhaustive matches, so
//! adding an [`EntityType`] variant fails compilation here until every
//! capability decides whether to support it. Operations still backed by
//! direct persistence are isolated behind [`EntityLifecycleService`];
//! GraphQL never calls a REST handler or database adapter directly.

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
use model::document::DocumentBasic;
use model_entity::EntityType;
use models_permissions::share_permission::UpdateSharePermissionRequestV2;
use unicode_segmentation::UnicodeSegmentation;
use uuid::Uuid;

#[cfg(test)]
mod test;

/// Upper bound on how many items of one batch run against downstream
/// services at once. `buffered` preserves input order, so results still map
/// one-to-one onto inputs.
const MAX_CONCURRENT_ENTITY_MUTATIONS: usize = 16;

/// Longest permitted project display name, in grapheme clusters.
const MAX_PROJECT_NAME_GRAPHEMES: usize = 100;

/// Error returned by [`EntityLifecycleService`] operations.
pub enum LifecycleError {
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

/// Project, document, and email-thread mutations still orchestrated directly
/// against persistence instead of a domain service.
///
/// Each method should migrate behind the domain port that owns its entity
/// kind; delete this trait once it is empty.
#[async_trait::async_trait]
pub trait EntityLifecycleService: Send + Sync + 'static {
    /// Load the project state required by application policy.
    async fn project_state(
        &self,
        entity: &EntityRef,
    ) -> Result<ProjectMutationState, LifecycleError>;
    /// Determine whether assigning `project_id` would create a cycle.
    async fn project_move_would_cycle(
        &self,
        entity: &EntityRef,
        project_id: &str,
    ) -> Result<bool, LifecycleError>;
    /// Rename a project.
    async fn rename_project(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
        display_name: String,
    ) -> Result<Vec<EntityRef>, LifecycleError>;
    /// Move a project to a parent or root.
    async fn move_project(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
        project_id: Option<String>,
    ) -> Result<Vec<EntityRef>, LifecycleError>;
    /// Update a project's share policy.
    async fn update_project_share_policy(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
        policy: UpdateSharePermissionRequestV2,
    ) -> Result<Vec<EntityRef>, LifecycleError>;
    /// Update an email thread's share policy.
    async fn update_thread_share_policy(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
        policy: UpdateSharePermissionRequestV2,
    ) -> Result<Vec<EntityRef>, LifecycleError>;
    /// Soft-delete a project tree.
    async fn trash_project(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LifecycleError>;
    /// Restore a project tree.
    async fn restore_project(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LifecycleError>;
    /// Permanently delete a project tree.
    async fn delete_project_permanently(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LifecycleError>;
    /// Restore a document.
    async fn restore_document(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LifecycleError>;
    /// Permanently delete a document.
    async fn delete_document_permanently(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LifecycleError>;
}

/// Internal failure for one mutation item.
///
/// Wraps each domain's error so item logic can use `?`; [`public_error`] is
/// the single place these are projected onto the stable public vocabulary.
enum MutationError {
    /// Access check on the requested entity failed.
    Access(AccessError),
    /// Access check on the target project of a move failed.
    TargetProject(AccessError),
    /// Document domain failure.
    Document(DocumentError),
    /// Chat domain failure.
    Chat(ChatErr),
    /// Channel domain failure.
    Channel(ChannelMutationErr),
    /// Call domain failure.
    Call(CallError),
    /// Email domain failure.
    Email(EmailErr),
    /// Favorites domain failure.
    Favorites(FavoritesError),
    /// Lifecycle port failure.
    Lifecycle(LifecycleError),
    /// Input violates a domain constraint.
    Invalid(String),
    /// Mutation conflicts with current entity state.
    Conflict(String),
    /// Actor lacks a capability not covered by an access receipt.
    Forbidden(String),
}

/// Wire a domain error into [`MutationError`] so `?` converts it.
macro_rules! impl_from_domain_error {
    ($($variant:ident($error:ty)),+ $(,)?) => {
        $(impl From<$error> for MutationError {
            fn from(error: $error) -> Self {
                Self::$variant(error)
            }
        })+
    };
}

impl_from_domain_error!(
    Access(AccessError),
    Document(DocumentError),
    Chat(ChatErr),
    Channel(ChannelMutationErr),
    Call(CallError),
    Email(EmailErr),
    Favorites(FavoritesError),
    Lifecycle(LifecycleError),
);

type MutationResult<T> = Result<T, MutationError>;

/// Project an internal failure onto the stable public error vocabulary.
///
/// Internal failures are logged here; callers run inside a per-item tracing
/// span that carries the operation and entity fields.
fn public_error(error: MutationError) -> EntityMutationError {
    use EntityMutationErrorCode as Code;
    fn internal(detail: &dyn std::fmt::Debug) -> EntityMutationError {
        tracing::error!(error = ?detail, "unified entity mutation failed");
        EntityMutationError::new(Code::Internal, "entity mutation failed")
    }
    match error {
        MutationError::Access(error) => match error {
            AccessError::Unauthorized | AccessError::UnauthorizedWithMessage(_) => {
                EntityMutationError::new(
                    Code::Forbidden,
                    "insufficient permission for entity mutation",
                )
            }
            AccessError::NotFound(_) => {
                EntityMutationError::new(Code::NotFound, "entity not found")
            }
            AccessError::BadRequest(message) => {
                EntityMutationError::new(Code::InvalidInput, message)
            }
            error @ (AccessError::DatabaseError(_) | AccessError::Internal) => internal(&error),
        },
        MutationError::TargetProject(error) => match error {
            AccessError::Unauthorized | AccessError::UnauthorizedWithMessage(_) => {
                EntityMutationError::new(
                    Code::Forbidden,
                    "insufficient permission for the target project",
                )
            }
            AccessError::NotFound(_) => {
                EntityMutationError::new(Code::NotFound, "target project not found")
            }
            AccessError::BadRequest(message) => {
                EntityMutationError::new(Code::InvalidInput, message)
            }
            error @ (AccessError::DatabaseError(_) | AccessError::Internal) => internal(&error),
        },
        MutationError::Document(error) => match error {
            DocumentError::NotFound(_) | DocumentError::Gone => {
                EntityMutationError::new(Code::NotFound, "document not found")
            }
            DocumentError::Unauthorized => {
                EntityMutationError::new(Code::Forbidden, "insufficient document permission")
            }
            DocumentError::Conflict(message) => EntityMutationError::new(Code::Conflict, message),
            DocumentError::BadRequest(message) => {
                EntityMutationError::new(Code::InvalidInput, message)
            }
            DocumentError::NameTooLong { max } => EntityMutationError::new(
                Code::InvalidInput,
                format!("display name exceeds {max} characters"),
            ),
            error => internal(&error),
        },
        MutationError::Chat(error) => match error {
            ChatErr::NotFound => EntityMutationError::new(Code::NotFound, "chat not found"),
            ChatErr::BadRequest(message) => EntityMutationError::new(Code::InvalidInput, message),
            ChatErr::Access(error) => public_error(MutationError::Access(error)),
            error @ ChatErr::Unknown(_) => internal(&error),
        },
        MutationError::Channel(error) => match error {
            ChannelMutationErr::BadRequest(message) => {
                EntityMutationError::new(Code::InvalidInput, message)
            }
            ChannelMutationErr::Unauthorized(_) => {
                EntityMutationError::new(Code::Forbidden, "insufficient channel role")
            }
            ChannelMutationErr::NotFound(_) => {
                EntityMutationError::new(Code::NotFound, "channel not found")
            }
            error => internal(&error),
        },
        MutationError::Call(error) => match error {
            CallError::NotFound(_) => EntityMutationError::new(Code::NotFound, "call not found"),
            CallError::Auth | CallError::NotInCall => {
                EntityMutationError::new(Code::Forbidden, "insufficient call permission")
            }
            CallError::InvalidRequest(message) => {
                EntityMutationError::new(Code::InvalidInput, message)
            }
            CallError::AlreadyInCall(_) => {
                EntityMutationError::new(Code::Conflict, error.to_string())
            }
            error @ CallError::Internal(_) => internal(&error),
        },
        MutationError::Email(error) => match error {
            EmailErr::ThreadNotFound => {
                EntityMutationError::new(Code::NotFound, "email thread not found")
            }
            EmailErr::Unauthorized => {
                EntityMutationError::new(Code::Forbidden, "insufficient email thread permission")
            }
            error => internal(&error),
        },
        MutationError::Favorites(error) => match error {
            FavoritesError::NotFound => {
                EntityMutationError::new(Code::NotFound, "favorite not found")
            }
            FavoritesError::BadRequest(message) => {
                EntityMutationError::new(Code::InvalidInput, message)
            }
            error @ FavoritesError::Internal(_) => internal(&error),
        },
        MutationError::Lifecycle(error) => match error {
            LifecycleError::NotFound => {
                EntityMutationError::new(Code::NotFound, "entity not found")
            }
            LifecycleError::InvalidInput(message) => {
                EntityMutationError::new(Code::InvalidInput, message)
            }
            LifecycleError::Internal(report) => internal(&report),
        },
        MutationError::Invalid(message) => EntityMutationError::new(Code::InvalidInput, message),
        MutationError::Conflict(message) => EntityMutationError::new(Code::Conflict, message),
        MutationError::Forbidden(message) => EntityMutationError::new(Code::Forbidden, message),
    }
}

/// Attach an internal failure to the entity it occurred on.
fn fail(requested: EntityRef, error: MutationError) -> EntityMutationOutcome {
    EntityMutationOutcome::failure(requested, public_error(error))
}

/// Build a success outcome from a lifecycle result, guaranteeing the
/// requested entity itself is listed as affected.
fn lifecycle_success(requested: EntityRef, mut affected: Vec<EntityRef>) -> EntityMutationOutcome {
    if !affected.contains(&requested) {
        affected.insert(0, requested.clone());
    }
    EntityMutationOutcome::success_with(requested.clone(), Some(requested), affected)
}

/// Build a success outcome that also marks container projects as affected.
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

/// Entity kinds a user may favorite.
///
/// Exhaustive so a new [`EntityType`] variant is a deliberate decision here,
/// not a silent default.
fn favoritable(entity_type: EntityType) -> bool {
    match entity_type {
        EntityType::Document
        | EntityType::Project
        | EntityType::Chat
        | EntityType::Channel
        | EntityType::EmailThread
        | EntityType::Call
        | EntityType::ForeignEntity
        | EntityType::StaticFile
        | EntityType::CrmCompany
        | EntityType::CrmContact => true,
        EntityType::User | EntityType::Team | EntityType::ChannelMessage => false,
    }
}

fn parse_uuid(entity: &EntityRef) -> MutationResult<Uuid> {
    Uuid::parse_str(&entity.entity_id)
        .map_err(|_| MutationError::Invalid("entity id must be a UUID".to_owned()))
}

fn sender_from_receipt<T: RequiredPermission>(
    receipt: EntityAccessReceipt<T>,
) -> MutationResult<Sender> {
    receipt
        .get_authenticated_user()
        .cloned()
        .map(Sender::new_from_user)
        .map_err(|_| MutationError::Forbidden("authenticated user required".to_owned()))
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
///
/// Access-level requirements deliberately mirror the legacy REST handlers
/// for each entity kind, including their asymmetries (for example, call
/// permanent-deletion requires `Edit` while other kinds require `Owner`,
/// and chat rename/move require `Owner` while documents require `Edit`).
/// Do not "normalize" a level without an explicit product decision:
/// tightening one breaks callers after the frontend migrates to this API.
#[derive(Clone)]
pub struct DssEntityMutationService<D, H, C, K, E, A, F, L> {
    documents: Arc<D>,
    chats: Arc<H>,
    channels: Arc<C>,
    calls: Arc<K>,
    email: Arc<E>,
    access: Arc<A>,
    favorites: Arc<F>,
    lifecycle: Arc<L>,
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
        lifecycle: Arc<L>,
    ) -> Self {
        Self {
            documents,
            chats,
            channels,
            calls,
            email,
            access,
            favorites,
            lifecycle,
        }
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
    L: EntityLifecycleService,
{
    async fn receipt<T: RequiredPermission>(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> MutationResult<EntityAccessReceipt<T>> {
        self.access
            .generate_entity_access_receipt::<T>(
                &actor.user_id,
                actor.organization_id,
                &entity.entity_id,
                entity.entity_type,
            )
            .await
            .map_err(MutationError::Access)
    }

    /// Require edit access on the target project of a move, when one is set.
    async fn target_project(
        &self,
        actor: &EntityMutationActor,
        project_id: Option<&str>,
    ) -> MutationResult<Option<EntityAccessReceipt<EditAccessLevel>>> {
        let Some(project_id) = project_id else {
            return Ok(None);
        };
        self.access
            .generate_entity_access_receipt::<EditAccessLevel>(
                &actor.user_id,
                actor.organization_id,
                project_id,
                EntityType::Project,
            )
            .await
            .map(Some)
            .map_err(MutationError::TargetProject)
    }

    /// Fetch a document and reject the mutation if it is trashed.
    async fn live_document(
        &self,
        entity: &EntityRef,
        action: &str,
    ) -> MutationResult<DocumentBasic> {
        let document = self
            .documents
            .internal_get_basic_document(&entity.entity_id)
            .await?;
        if document.deleted_at.is_some() {
            return Err(MutationError::Conflict(format!(
                "cannot {action} a deleted document"
            )));
        }
        Ok(document)
    }

    /// Reject the mutation if the project is trashed.
    async fn live_project(&self, entity: &EntityRef, action: &str) -> MutationResult<()> {
        if self.lifecycle.project_state(entity).await?.deleted {
            return Err(MutationError::Conflict(format!(
                "cannot {action} a deleted project"
            )));
        }
        Ok(())
    }

    async fn chat_project_id(
        &self,
        owner_receipt: &EntityAccessReceipt<OwnerAccessLevel>,
    ) -> MutationResult<Option<String>> {
        let view_receipt = owner_receipt
            .clone()
            .try_into_requirement::<ViewAccessLevel>()
            .map_err(MutationError::Access)?;
        Ok(self.chats.get_metadata(view_receipt).await?.project_id)
    }

    async fn require_archived_call(
        &self,
        edit_receipt: &EntityAccessReceipt<EditAccessLevel>,
        operation: &str,
    ) -> MutationResult<()> {
        let view_receipt = edit_receipt
            .clone()
            .try_into_requirement::<ViewAccessLevel>()
            .map_err(MutationError::Access)?;
        if self.calls.get_call_record(view_receipt).await?.is_active {
            return Err(MutationError::Conflict(format!(
                "cannot {operation} an active call"
            )));
        }
        Ok(())
    }

    // Rename.

    #[tracing::instrument(skip_all, fields(entity_type = %request.entity.entity_type, entity_id = %request.entity.entity_id))]
    async fn rename_one(
        &self,
        actor: &EntityMutationActor,
        request: RenameEntityRequest,
    ) -> EntityMutationOutcome {
        let RenameEntityRequest {
            entity: requested,
            display_name,
        } = request;
        let result = match requested.entity_type {
            EntityType::Document => self.rename_document(actor, &requested, display_name).await,
            EntityType::Chat => self.rename_chat(actor, &requested, display_name).await,
            EntityType::Channel => self.rename_channel(actor, &requested, display_name).await,
            EntityType::Call => self.rename_call(actor, &requested, display_name).await,
            EntityType::Project => self.rename_project(actor, &requested, display_name).await,
            EntityType::User
            | EntityType::Team
            | EntityType::ChannelMessage
            | EntityType::EmailThread
            | EntityType::ForeignEntity
            | EntityType::StaticFile
            | EntityType::CrmCompany
            | EntityType::CrmContact => {
                return EntityMutationOutcome::unsupported(requested, "rename");
            }
        };
        result.unwrap_or_else(|error| fail(requested, error))
    }

    async fn rename_document(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        display_name: String,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<EditAccessLevel>(actor, requested).await?;
        let document = self.live_document(requested, "rename").await?;
        self.documents
            .edit_document(
                receipt,
                document,
                EditDocumentServiceArgs {
                    document_name: Some(display_name),
                    project_id: None,
                    share_permission: None,
                    file_type: None,
                },
            )
            .await?;
        Ok(EntityMutationOutcome::success(requested.clone()))
    }

    async fn rename_chat(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        display_name: String,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<OwnerAccessLevel>(actor, requested).await?;
        self.chats
            .patch(
                receipt,
                PatchChatArgs {
                    name: Some(display_name),
                    project_id: None,
                    share_permission: None,
                },
            )
            .await?;
        Ok(EntityMutationOutcome::success(requested.clone()))
    }

    async fn rename_channel(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        display_name: String,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self
            .receipt::<AdminParticipantRole>(actor, requested)
            .await?;
        let channel_id = parse_uuid(requested)?;
        let sender = sender_from_receipt(receipt)?;
        self.channels
            .patch_channel(
                sender,
                channel_id,
                PatchChannelRequest {
                    channel_name: Some(display_name),
                },
            )
            .await?;
        Ok(EntityMutationOutcome::success(requested.clone()))
    }

    async fn rename_call(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        display_name: String,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<EditAccessLevel>(actor, requested).await?;
        self.require_archived_call(&receipt, "rename").await?;
        self.calls
            .edit_call_record(
                receipt,
                EditCallRecordRequest {
                    share_permission: None,
                    share_with_team: None,
                    custom_name: Some(display_name),
                },
            )
            .await?;
        Ok(EntityMutationOutcome::success(requested.clone()))
    }

    async fn rename_project(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        display_name: String,
    ) -> MutationResult<EntityMutationOutcome> {
        self.receipt::<EditAccessLevel>(actor, requested).await?;
        self.live_project(requested, "rename").await?;
        if display_name.graphemes(true).count() > MAX_PROJECT_NAME_GRAPHEMES {
            return Err(MutationError::Invalid(format!(
                "project name exceeds {MAX_PROJECT_NAME_GRAPHEMES} characters"
            )));
        }
        let affected = self
            .lifecycle
            .rename_project(actor, requested, display_name)
            .await?;
        Ok(lifecycle_success(requested.clone(), affected))
    }

    // Move.

    #[tracing::instrument(skip_all, fields(entity_type = %request.entity.entity_type, entity_id = %request.entity.entity_id))]
    async fn move_one(
        &self,
        actor: &EntityMutationActor,
        request: MoveEntityRequest,
    ) -> EntityMutationOutcome {
        let MoveEntityRequest {
            entity: requested,
            project_id,
        } = request;
        let result = match requested.entity_type {
            EntityType::Document => self.move_document(actor, &requested, project_id).await,
            EntityType::Chat => self.move_chat(actor, &requested, project_id).await,
            EntityType::EmailThread => self.move_email_thread(actor, &requested, project_id).await,
            EntityType::Project => self.move_project(actor, &requested, project_id).await,
            EntityType::User
            | EntityType::Team
            | EntityType::Channel
            | EntityType::ChannelMessage
            | EntityType::Call
            | EntityType::ForeignEntity
            | EntityType::StaticFile
            | EntityType::CrmCompany
            | EntityType::CrmContact => {
                return EntityMutationOutcome::unsupported(requested, "move");
            }
        };
        result.unwrap_or_else(|error| fail(requested, error))
    }

    async fn move_document(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        project_id: Option<String>,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<EditAccessLevel>(actor, requested).await?;
        let document = self.live_document(requested, "move").await?;
        let old_project_id = document.project_id.clone().map(|id| id.to_string());
        self.target_project(actor, project_id.as_deref()).await?;
        self.documents
            .edit_document(
                receipt,
                document,
                EditDocumentServiceArgs {
                    document_name: None,
                    // The document edit API uses an empty id to mean "root".
                    project_id: Some(project_id.clone().unwrap_or_default()),
                    share_permission: None,
                    file_type: None,
                },
            )
            .await?;
        Ok(success_with_projects(
            requested.clone(),
            [old_project_id, project_id],
        ))
    }

    async fn move_chat(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        project_id: Option<String>,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<OwnerAccessLevel>(actor, requested).await?;
        let old_project_id = self.chat_project_id(&receipt).await?;
        self.target_project(actor, project_id.as_deref()).await?;
        self.chats
            .patch(
                receipt,
                PatchChatArgs {
                    name: None,
                    // The chat patch API uses an empty id to mean "root".
                    project_id: Some(project_id.clone().unwrap_or_default()),
                    share_permission: None,
                },
            )
            .await?;
        Ok(success_with_projects(
            requested.clone(),
            [old_project_id, project_id],
        ))
    }

    async fn move_email_thread(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        project_id: Option<String>,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<EditAccessLevel>(actor, requested).await?;
        let project_receipt = self.target_project(actor, project_id.as_deref()).await?;
        let old_project_id = self
            .email
            .update_thread_project(receipt, project_receipt)
            .await?;
        Ok(success_with_projects(
            requested.clone(),
            [old_project_id, project_id],
        ))
    }

    async fn move_project(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        project_id: Option<String>,
    ) -> MutationResult<EntityMutationOutcome> {
        self.receipt::<OwnerAccessLevel>(actor, requested).await?;
        self.target_project(actor, project_id.as_deref()).await?;
        self.live_project(requested, "move").await?;
        if project_id.as_deref() == Some(requested.entity_id.as_str()) {
            return Err(MutationError::Invalid(
                "project cannot be its own parent".to_owned(),
            ));
        }
        if let Some(parent_id) = project_id.as_deref()
            && self
                .lifecycle
                .project_move_would_cycle(requested, parent_id)
                .await?
        {
            return Err(MutationError::Invalid(
                "project move would create a cycle".to_owned(),
            ));
        }
        let affected = self
            .lifecycle
            .move_project(actor, requested, project_id)
            .await?;
        Ok(lifecycle_success(requested.clone(), affected))
    }

    // Share policy.

    #[tracing::instrument(skip_all, fields(entity_type = %request.entity.entity_type, entity_id = %request.entity.entity_id))]
    async fn update_share_policy_one(
        &self,
        actor: &EntityMutationActor,
        request: UpdateEntitySharePolicyRequest,
    ) -> EntityMutationOutcome {
        let UpdateEntitySharePolicyRequest {
            entity: requested,
            policy,
        } = request;
        let result = match requested.entity_type {
            EntityType::Document => self.share_document(actor, &requested, policy).await,
            EntityType::Chat => self.share_chat(actor, &requested, policy).await,
            EntityType::Call => self.share_call(actor, &requested, policy).await,
            EntityType::Project => self.share_project(actor, &requested, policy).await,
            EntityType::EmailThread => self.share_email_thread(actor, &requested, policy).await,
            // Channels grant access through participant roles and channel
            // messages inherit from their channel; neither has a share policy.
            EntityType::User
            | EntityType::Team
            | EntityType::Channel
            | EntityType::ChannelMessage
            | EntityType::ForeignEntity
            | EntityType::StaticFile
            | EntityType::CrmCompany
            | EntityType::CrmContact => {
                return EntityMutationOutcome::unsupported(requested, "share policy updates");
            }
        };
        result.unwrap_or_else(|error| fail(requested, error))
    }

    async fn share_document(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        policy: UpdateSharePermissionRequestV2,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<EditAccessLevel>(actor, requested).await?;
        let document = self.live_document(requested, "update sharing for").await?;
        self.documents
            .edit_document(
                receipt,
                document,
                EditDocumentServiceArgs {
                    document_name: None,
                    project_id: None,
                    share_permission: Some(policy),
                    file_type: None,
                },
            )
            .await?;
        Ok(EntityMutationOutcome::success(requested.clone()))
    }

    async fn share_chat(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        policy: UpdateSharePermissionRequestV2,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<OwnerAccessLevel>(actor, requested).await?;
        self.chats
            .patch(
                receipt,
                PatchChatArgs {
                    name: None,
                    project_id: None,
                    share_permission: Some(policy),
                },
            )
            .await?;
        Ok(EntityMutationOutcome::success(requested.clone()))
    }

    async fn share_call(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        policy: UpdateSharePermissionRequestV2,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<EditAccessLevel>(actor, requested).await?;
        self.calls
            .edit_call_record(
                receipt,
                EditCallRecordRequest {
                    share_permission: Some(policy),
                    share_with_team: None,
                    custom_name: None,
                },
            )
            .await?;
        Ok(EntityMutationOutcome::success(requested.clone()))
    }

    async fn share_project(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        policy: UpdateSharePermissionRequestV2,
    ) -> MutationResult<EntityMutationOutcome> {
        self.receipt::<OwnerAccessLevel>(actor, requested).await?;
        self.live_project(requested, "update sharing for").await?;
        let affected = self
            .lifecycle
            .update_project_share_policy(actor, requested, policy)
            .await?;
        Ok(lifecycle_success(requested.clone(), affected))
    }

    async fn share_email_thread(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        policy: UpdateSharePermissionRequestV2,
    ) -> MutationResult<EntityMutationOutcome> {
        self.receipt::<OwnerAccessLevel>(actor, requested).await?;
        let affected = self
            .lifecycle
            .update_thread_share_policy(actor, requested, policy)
            .await?;
        Ok(lifecycle_success(requested.clone(), affected))
    }

    // Trash.

    #[tracing::instrument(skip_all, fields(entity_type = %requested.entity_type, entity_id = %requested.entity_id))]
    async fn trash_one(
        &self,
        actor: &EntityMutationActor,
        requested: EntityRef,
    ) -> EntityMutationOutcome {
        let result = match requested.entity_type {
            EntityType::Document => self.trash_document(actor, &requested).await,
            EntityType::Chat => self.trash_chat(actor, &requested).await,
            EntityType::Project => {
                self.lifecycle_op(actor, &requested, EntityLifecycleService::trash_project)
                    .await
            }
            EntityType::User
            | EntityType::Team
            | EntityType::Channel
            | EntityType::ChannelMessage
            | EntityType::EmailThread
            | EntityType::Call
            | EntityType::ForeignEntity
            | EntityType::StaticFile
            | EntityType::CrmCompany
            | EntityType::CrmContact => {
                return EntityMutationOutcome::unsupported(requested, "trash");
            }
        };
        result.unwrap_or_else(|error| fail(requested, error))
    }

    async fn trash_document(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<OwnerAccessLevel>(actor, requested).await?;
        let project_id = self
            .documents
            .internal_get_basic_document(&requested.entity_id)
            .await?
            .project_id;
        let affected_project_id = project_id.clone().map(|id| id.to_string());
        self.documents.delete_document(receipt, project_id).await?;
        Ok(success_with_projects(
            requested.clone(),
            [affected_project_id],
        ))
    }

    async fn trash_chat(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<OwnerAccessLevel>(actor, requested).await?;
        let project_id = self.chat_project_id(&receipt).await?;
        self.chats.delete(receipt).await?;
        Ok(success_with_projects(requested.clone(), [project_id]))
    }

    /// Owner-gated lifecycle operation shared by project and document arms.
    async fn lifecycle_op<'a, Op, Fut>(
        &'a self,
        actor: &'a EntityMutationActor,
        requested: &'a EntityRef,
        operation: Op,
    ) -> MutationResult<EntityMutationOutcome>
    where
        Op: FnOnce(&'a L, &'a EntityMutationActor, &'a EntityRef) -> Fut,
        Fut: Future<Output = Result<Vec<EntityRef>, LifecycleError>> + 'a,
    {
        self.receipt::<OwnerAccessLevel>(actor, requested).await?;
        let affected = operation(&self.lifecycle, actor, requested).await?;
        Ok(lifecycle_success(requested.clone(), affected))
    }

    // Restore.

    #[tracing::instrument(skip_all, fields(entity_type = %requested.entity_type, entity_id = %requested.entity_id))]
    async fn restore_one(
        &self,
        actor: &EntityMutationActor,
        requested: EntityRef,
    ) -> EntityMutationOutcome {
        let result = match requested.entity_type {
            EntityType::Document => {
                self.lifecycle_op(actor, &requested, EntityLifecycleService::restore_document)
                    .await
            }
            EntityType::Chat => self.restore_chat(actor, &requested).await,
            EntityType::Project => {
                self.lifecycle_op(actor, &requested, EntityLifecycleService::restore_project)
                    .await
            }
            EntityType::User
            | EntityType::Team
            | EntityType::Channel
            | EntityType::ChannelMessage
            | EntityType::EmailThread
            | EntityType::Call
            | EntityType::ForeignEntity
            | EntityType::StaticFile
            | EntityType::CrmCompany
            | EntityType::CrmContact => {
                return EntityMutationOutcome::unsupported(requested, "restore");
            }
        };
        result.unwrap_or_else(|error| fail(requested, error))
    }

    async fn restore_chat(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<OwnerAccessLevel>(actor, requested).await?;
        let project_id = self.chat_project_id(&receipt).await?;
        self.chats.revert_delete(receipt).await?;
        Ok(success_with_projects(requested.clone(), [project_id]))
    }

    // Permanent deletion.

    #[tracing::instrument(skip_all, fields(entity_type = %requested.entity_type, entity_id = %requested.entity_id))]
    async fn delete_permanently_one(
        &self,
        actor: &EntityMutationActor,
        requested: EntityRef,
    ) -> EntityMutationOutcome {
        let result = match requested.entity_type {
            EntityType::Document => {
                self.lifecycle_op(
                    actor,
                    &requested,
                    EntityLifecycleService::delete_document_permanently,
                )
                .await
            }
            EntityType::Chat => self.delete_chat_permanently(actor, &requested).await,
            EntityType::Channel => self.delete_channel_permanently(actor, &requested).await,
            EntityType::Call => self.delete_call_permanently(actor, &requested).await,
            EntityType::Project => {
                self.lifecycle_op(
                    actor,
                    &requested,
                    EntityLifecycleService::delete_project_permanently,
                )
                .await
            }
            EntityType::User
            | EntityType::Team
            | EntityType::ChannelMessage
            | EntityType::EmailThread
            | EntityType::ForeignEntity
            | EntityType::StaticFile
            | EntityType::CrmCompany
            | EntityType::CrmContact => {
                return EntityMutationOutcome::unsupported(requested, "permanent deletion");
            }
        };
        result.unwrap_or_else(|error| fail(requested, error))
    }

    async fn delete_chat_permanently(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<OwnerAccessLevel>(actor, requested).await?;
        let project_id = self.chat_project_id(&receipt).await?;
        self.chats.permanently_delete(receipt).await?;
        Ok(success_with_projects(requested.clone(), [project_id]))
    }

    async fn delete_channel_permanently(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self
            .receipt::<OwnerParticipantRole>(actor, requested)
            .await?;
        let channel_id = parse_uuid(requested)?;
        let sender = sender_from_receipt(receipt)?;
        self.channels.delete_channel(sender, channel_id).await?;
        Ok(EntityMutationOutcome::success(requested.clone()))
    }

    async fn delete_call_permanently(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<EditAccessLevel>(actor, requested).await?;
        self.require_archived_call(&receipt, "permanently delete")
            .await?;
        self.calls.delete_call_record(receipt).await?;
        Ok(EntityMutationOutcome::success(requested.clone()))
    }

    // Duplication.

    #[tracing::instrument(skip_all, fields(entity_type = %request.entity.entity_type, entity_id = %request.entity.entity_id))]
    async fn duplicate_one(
        &self,
        actor: &EntityMutationActor,
        request: DuplicateEntityRequest,
    ) -> EntityMutationOutcome {
        let DuplicateEntityRequest {
            entity: requested,
            display_name,
        } = request;
        let result = match requested.entity_type {
            EntityType::Document => {
                self.duplicate_document(actor, &requested, display_name)
                    .await
            }
            EntityType::Chat => self.duplicate_chat(actor, &requested, display_name).await,
            EntityType::User
            | EntityType::Team
            | EntityType::Channel
            | EntityType::ChannelMessage
            | EntityType::EmailThread
            | EntityType::Project
            | EntityType::Call
            | EntityType::ForeignEntity
            | EntityType::StaticFile
            | EntityType::CrmCompany
            | EntityType::CrmContact => {
                return EntityMutationOutcome::unsupported(requested, "duplication");
            }
        };
        result.unwrap_or_else(|error| fail(requested, error))
    }

    async fn duplicate_document(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        display_name: Option<String>,
    ) -> MutationResult<EntityMutationOutcome> {
        let receipt = self.receipt::<ViewAccessLevel>(actor, requested).await?;
        let document = self
            .documents
            .internal_get_basic_document(&requested.entity_id)
            .await?;
        let display_name =
            display_name.unwrap_or_else(|| format!("{} copy", document.document_name));
        let response = self
            .documents
            .copy_document(
                receipt,
                document,
                actor.user_id.clone(),
                display_name,
                None,
                None,
            )
            .await?;
        let created = EntityRef::new(
            EntityType::Document,
            response.document_metadata.metadata.document_id,
        );
        Ok(EntityMutationOutcome::success_with(
            requested.clone(),
            Some(created.clone()),
            vec![created],
        ))
    }

    async fn duplicate_chat(
        &self,
        actor: &EntityMutationActor,
        requested: &EntityRef,
        display_name: Option<String>,
    ) -> MutationResult<EntityMutationOutcome> {
        if display_name.is_some() {
            return Err(MutationError::Invalid(
                "chat duplication does not yet accept a custom display name".to_owned(),
            ));
        }
        let receipt = self.receipt::<ViewAccessLevel>(actor, requested).await?;
        let id = self.chats.copy_chat(receipt).await?;
        let created = EntityRef::new(EntityType::Chat, id);
        Ok(EntityMutationOutcome::success_with(
            requested.clone(),
            Some(created.clone()),
            vec![created],
        ))
    }

    // Favorites.

    /// Require that the actor can see the entity before favoriting it.
    async fn favorite_visibility(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> MutationResult<()> {
        // Static files have no permission record; any access-level row makes
        // them visible.
        if entity.entity_type == EntityType::StaticFile {
            return match self
                .access
                .get_access_level(Some(&actor.user_id), &entity.entity_id, entity.entity_type)
                .await
            {
                Ok(Some(_)) => Ok(()),
                Ok(None) => Err(MutationError::Access(AccessError::Unauthorized)),
                Err(error) => Err(MutationError::Access(error)),
            };
        }
        self.access
            .get_entity_permission(
                Some(&actor.user_id),
                &entity.entity_id,
                entity.entity_type,
                actor.organization_id,
            )
            .await
            .map(|_| ())
            .map_err(MutationError::Access)
    }

    async fn set_favorite_one(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
        favorite: bool,
    ) -> MutationResult<()> {
        let domain_entity = entity
            .entity_type
            .with_entity_str(entity.entity_id.as_str());
        if favorite {
            self.favorite_visibility(actor, entity).await?;
            self.favorites
                .add_favorite(&actor.user_id, &domain_entity)
                .await?;
        } else {
            self.favorites
                .remove_favorite_by_entity(&actor.user_id, &domain_entity)
                .await?;
        }
        Ok(())
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
    L: EntityLifecycleService,
{
    async fn rename_entities(
        &self,
        actor: EntityMutationActor,
        requests: Vec<RenameEntityRequest>,
    ) -> Vec<EntityMutationOutcome> {
        collect_ordered(
            requests
                .into_iter()
                .map(|request| self.rename_one(&actor, request)),
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
                .map(|request| self.move_one(&actor, request)),
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
                .map(|request| self.update_share_policy_one(&actor, request)),
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
                .map(|entity| self.trash_one(&actor, entity)),
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
                .map(|entity| self.restore_one(&actor, entity)),
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
                .map(|entity| self.delete_permanently_one(&actor, entity)),
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
                .map(|request| self.duplicate_one(&actor, request)),
        )
        .await
    }

    #[tracing::instrument(skip_all, fields(entity_type = %entity.entity_type, entity_id = %entity.entity_id))]
    async fn set_favorite(
        &self,
        actor: EntityMutationActor,
        entity: EntityRef,
        favorite: bool,
    ) -> EntityMutationOutcome {
        if !favoritable(entity.entity_type) {
            return EntityMutationOutcome::unsupported(entity, "favorites");
        }
        match self.set_favorite_one(&actor, &entity, favorite).await {
            Ok(()) => EntityMutationOutcome::success(entity),
            Err(error) => fail(entity, error),
        }
    }
}
