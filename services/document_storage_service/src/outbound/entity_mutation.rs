//! Adapter for project and document lifecycle operations that still use the
//! legacy database clients.

use std::sync::Arc;

use crate::{
    api::{context::EntityAccessManagementService, util::count_occurrences},
    service::entity_mutation::{
        LegacyEntityMutationError, LegacyEntityMutationService, ProjectMutationState,
    },
};
use entity_access_management::domain::ports::EntityAccessManagementService as _;
use entity_mutation::{EntityMutationActor, EntityRef};
use macro_sha_count_client::Redis;
use model_entity::EntityType;
use models_permissions::share_permission::UpdateSharePermissionRequestV2;
use sqlx::PgPool;
use sqs_client::search::{
    SearchQueueMessage,
    chat::RemoveChatMessage,
    document::DocumentId,
    project::{RemoveProject, UpsertProject},
};

/// Production legacy-lifecycle adapter.
pub struct DssLegacyEntityMutationAdapter {
    db: PgPool,
    redis: Arc<Redis>,
    sqs: Arc<sqs_client::SQS>,
    access_management: EntityAccessManagementService,
}

impl DssLegacyEntityMutationAdapter {
    /// Construct the adapter from concrete outbound dependencies.
    pub fn new(
        db: PgPool,
        redis: Arc<Redis>,
        sqs: Arc<sqs_client::SQS>,
        access_management: EntityAccessManagementService,
    ) -> Self {
        Self {
            db,
            redis,
            sqs,
            access_management,
        }
    }

    async fn project(
        &self,
        entity: &EntityRef,
    ) -> Result<model::project::BasicProject, LegacyEntityMutationError> {
        macro_db_client::projects::get_project::get_basic_project::get_basic_project(
            &self.db,
            &entity.entity_id,
        )
        .await
        .map_err(|error| match error {
            sqlx::Error::RowNotFound => LegacyEntityMutationError::NotFound,
            error => LegacyEntityMutationError::Internal(rootcause::report!(error).into()),
        })
    }

    async fn patch_project(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
        name: Option<&str>,
        parent_id: Option<&str>,
        share_policy: Option<&UpdateSharePermissionRequestV2>,
    ) -> Result<(), LegacyEntityMutationError> {
        let mut transaction = self.db.begin().await.map_err(|error| {
            LegacyEntityMutationError::Internal(rootcause::report!(error).into())
        })?;
        macro_db_client::projects::edit_project_v2(
            &mut transaction,
            actor.user_id.as_ref(),
            &entity.entity_id,
            name,
            parent_id,
            share_policy,
        )
        .await
        .map_err(|error| LegacyEntityMutationError::Internal(rootcause::report!(error).into()))?;
        transaction.commit().await.map_err(|error| {
            LegacyEntityMutationError::Internal(rootcause::report!(error).into())
        })?;
        Ok(())
    }

    fn refs(
        entity_type: EntityType,
        ids: impl IntoIterator<Item = String>,
    ) -> impl Iterator<Item = EntityRef> {
        ids.into_iter()
            .map(move |id| EntityRef::new(entity_type, id))
    }
}

#[async_trait::async_trait]
impl LegacyEntityMutationService for DssLegacyEntityMutationAdapter {
    async fn project_state(
        &self,
        entity: &EntityRef,
    ) -> Result<ProjectMutationState, LegacyEntityMutationError> {
        let project = self.project(entity).await?;
        Ok(ProjectMutationState {
            deleted: project.deleted_at.is_some(),
        })
    }

    async fn project_move_would_cycle(
        &self,
        entity: &EntityRef,
        project_id: &str,
    ) -> Result<bool, LegacyEntityMutationError> {
        macro_db_client::projects::nested_projects::is_project_recursively_nested(
            self.db.clone(),
            &entity.entity_id,
            project_id,
        )
        .await
        .map(|nested| nested.is_some())
        .map_err(|error| LegacyEntityMutationError::Internal(rootcause::report!(error).into()))
    }

    async fn rename_project(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
        display_name: String,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError> {
        let project = self.project(entity).await?;
        self.patch_project(actor, entity, Some(&display_name), None, None)
            .await?;
        macro_project_utils::update_project_modified(
            &self.db,
            Some(self.sqs.as_ref()),
            macro_project_utils::ProjectModifiedArgs {
                project_id: Some(entity.entity_id.clone()),
                old_project_id: None,
                user_id: actor.user_id.to_string(),
            },
        )
        .await;
        Ok(project
            .parent_id
            .into_iter()
            .map(|id| EntityRef::new(EntityType::Project, id))
            .collect())
    }

    async fn move_project(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
        project_id: Option<String>,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError> {
        let project = self.project(entity).await?;
        self.patch_project(
            actor,
            entity,
            None,
            Some(project_id.as_deref().unwrap_or_default()),
            None,
        )
        .await?;
        let project_uuid = uuid::Uuid::parse_str(&entity.entity_id).map_err(|error| {
            LegacyEntityMutationError::InvalidInput(format!("invalid project id: {error}"))
        })?;
        let old_parent = project
            .parent_id
            .as_deref()
            .map(uuid::Uuid::parse_str)
            .transpose()
            .map_err(|error| {
                LegacyEntityMutationError::Internal(rootcause::report!(error).into())
            })?;
        let new_parent = project_id
            .as_deref()
            .map(uuid::Uuid::parse_str)
            .transpose()
            .map_err(|error| LegacyEntityMutationError::InvalidInput(error.to_string()))?;
        if old_parent != new_parent {
            let _ = self
                .access_management
                .move_project(&project_uuid, old_parent.as_ref(), new_parent.as_ref())
                .await
                .inspect_err(|error| {
                    tracing::error!(error = ?error, "unable to update project entity access after move")
                });
        }
        macro_project_utils::update_project_modified(
            &self.db,
            Some(self.sqs.as_ref()),
            macro_project_utils::ProjectModifiedArgs {
                project_id: project_id.clone(),
                old_project_id: project.parent_id.clone(),
                user_id: actor.user_id.to_string(),
            },
        )
        .await;

        Ok(Self::refs(
            EntityType::Project,
            project.parent_id.into_iter().chain(project_id),
        )
        .collect())
    }

    async fn update_project_share_policy(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
        policy: UpdateSharePermissionRequestV2,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError> {
        self.patch_project(actor, entity, None, None, Some(&policy))
            .await?;
        macro_project_utils::update_project_modified(
            &self.db,
            Some(self.sqs.as_ref()),
            macro_project_utils::ProjectModifiedArgs {
                project_id: Some(entity.entity_id.clone()),
                old_project_id: None,
                user_id: actor.user_id.to_string(),
            },
        )
        .await;
        Ok(Vec::new())
    }

    async fn trash_project(
        &self,
        actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError> {
        let project = self.project(entity).await?;
        let (project_ids, document_ids, chat_ids) =
            macro_db_client::projects::delete::soft_delete_project(&self.db, &entity.entity_id)
                .await
                .map_err(|error| {
                    LegacyEntityMutationError::Internal(rootcause::report!(error).into())
                })?;

        if !project_ids.is_empty() {
            self.sqs
                .bulk_send_message_to_search_event_queue(
                    project_ids
                        .iter()
                        .map(|id| {
                            SearchQueueMessage::RemoveProject(RemoveProject {
                                project_id: id.clone(),
                                index_override: None,
                            })
                        })
                        .collect(),
                )
                .await
                .inspect_err(
                    |error| tracing::error!(error = ?error, "unable to enqueue deleted projects"),
                )
                .ok();
        }
        if let Some(parent_id) = project.parent_id.as_deref() {
            macro_project_utils::update_project_modified(
                &self.db,
                Some(self.sqs.as_ref()),
                macro_project_utils::ProjectModifiedArgs {
                    project_id: None,
                    old_project_id: Some(parent_id),
                    user_id: actor.user_id.to_string(),
                },
            )
            .await;
        }

        Ok(Self::refs(EntityType::Project, project_ids)
            .chain(Self::refs(EntityType::Document, document_ids))
            .chain(Self::refs(EntityType::Chat, chat_ids))
            .collect())
    }

    async fn restore_project(
        &self,
        _actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError> {
        let project = self.project(entity).await?;
        let mut transaction = self.db.begin().await.map_err(|error| {
            LegacyEntityMutationError::Internal(rootcause::report!(error).into())
        })?;
        let project_ids_before_restore =
            macro_db_client::projects::get_project::get_sub_items::get_all_deleted_sub_project_ids(
                &mut transaction,
                &entity.entity_id,
            )
            .await
            .map_err(|error| LegacyEntityMutationError::Internal(rootcause::report!(error).into()))?
            .into_iter()
            .map(|(id, _)| id)
            .collect::<Vec<_>>();
        transaction.rollback().await.map_err(|error| {
            LegacyEntityMutationError::Internal(rootcause::report!(error).into())
        })?;
        let document_ids = macro_db_client::projects::get_project::get_project_documents::get_deleted_documents_from_project_ids(
            &self.db,
            &project_ids_before_restore,
        )
        .await
        .map_err(|error| LegacyEntityMutationError::Internal(rootcause::report!(error).into()))?
        .into_iter()
        .map(|(id, _)| id)
        .collect::<Vec<_>>();
        let chat_ids = macro_db_client::projects::get_project::get_project_chats::get_deleted_chats_from_project_ids(
            &self.db,
            &project_ids_before_restore,
        )
        .await
        .map_err(|error| LegacyEntityMutationError::Internal(rootcause::report!(error).into()))?
        .into_iter()
        .map(|(id, _)| id)
        .collect::<Vec<_>>();
        let project_ids = macro_db_client::projects::revert_delete::revert_delete_project(
            &self.db,
            &entity.entity_id,
            project.parent_id.as_deref(),
        )
        .await
        .map_err(|error| LegacyEntityMutationError::Internal(rootcause::report!(error).into()))?;
        if !project_ids.is_empty() {
            self.sqs
                .bulk_send_message_to_search_event_queue(
                    project_ids
                        .iter()
                        .map(|id| {
                            SearchQueueMessage::UpsertProject(UpsertProject {
                                project_id: id.clone(),
                                index_override: None,
                            })
                        })
                        .collect(),
                )
                .await
                .inspect_err(
                    |error| tracing::error!(error = ?error, "unable to enqueue restored projects"),
                )
                .ok();
        }
        Ok(Self::refs(EntityType::Project, project_ids)
            .chain(Self::refs(EntityType::Document, document_ids))
            .chain(Self::refs(EntityType::Chat, chat_ids))
            .collect())
    }

    async fn delete_project_permanently(
        &self,
        _actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError> {
        let mut transaction = self.db.begin().await.map_err(|error| {
            LegacyEntityMutationError::Internal(rootcause::report!(error).into())
        })?;
        let project_ids =
            macro_db_client::projects::get_project::get_sub_items::get_all_deleted_sub_project_ids(
                &mut transaction,
                &entity.entity_id,
            )
            .await
            .map_err(|error| LegacyEntityMutationError::Internal(rootcause::report!(error).into()))?
            .into_iter()
            .map(|(id, _)| id)
            .collect::<Vec<_>>();
        let documents = macro_db_client::projects::get_project::get_project_documents::get_deleted_documents_from_project_ids(
            &self.db,
            &project_ids,
        )
        .await
        .map_err(|error| LegacyEntityMutationError::Internal(rootcause::report!(error).into()))?;
        let document_ids = documents.iter().map(|(id, _)| id).collect::<Vec<_>>();
        let bom_parts =
            macro_db_client::document::get_bom_parts_bulk_tsx(&mut transaction, &document_ids)
                .await
                .map_err(|error| {
                    LegacyEntityMutationError::Internal(rootcause::report!(error).into())
                })?;
        if !bom_parts.is_empty() {
            self.redis
                .decrement_counts(&count_occurrences(
                    bom_parts.into_iter().map(|part| part.sha).collect(),
                ))
                .await
                .map_err(|error| {
                    LegacyEntityMutationError::Internal(rootcause::report!(error).into())
                })?;
        }
        macro_db_client::document::delete_document_bulk_tsx(&mut transaction, &document_ids)
            .await
            .map_err(|error| {
                LegacyEntityMutationError::Internal(rootcause::report!(error).into())
            })?;
        let chats = macro_db_client::projects::get_project::get_project_chats::get_deleted_chats_from_project_ids(
            &self.db,
            &project_ids,
        )
        .await
        .map_err(|error| LegacyEntityMutationError::Internal(rootcause::report!(error).into()))?;
        let chat_ids = chats.into_iter().map(|(id, _)| id).collect::<Vec<_>>();
        macro_db_client::chat::delete::delete_chat_bulk_tsx(&mut transaction, &chat_ids)
            .await
            .map_err(|error| {
                LegacyEntityMutationError::Internal(rootcause::report!(error).into())
            })?;
        macro_db_client::projects::delete::delete_projects_bulk_tsx(&mut transaction, &project_ids)
            .await
            .map_err(|error| {
                LegacyEntityMutationError::Internal(rootcause::report!(error).into())
            })?;
        transaction.commit().await.map_err(|error| {
            LegacyEntityMutationError::Internal(rootcause::report!(error).into())
        })?;

        let owned_document_ids = documents
            .iter()
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        let mut search_events = project_ids
            .iter()
            .map(|id| {
                SearchQueueMessage::RemoveProject(RemoveProject {
                    project_id: id.clone(),
                    index_override: None,
                })
            })
            .chain(chat_ids.iter().map(|id| {
                SearchQueueMessage::RemoveChatMessage(RemoveChatMessage {
                    chat_id: id.clone(),
                    message_id: None,
                    index_override: None,
                })
            }))
            .chain(owned_document_ids.iter().map(|id| {
                SearchQueueMessage::RemoveDocument(DocumentId {
                    document_id: id.clone(),
                })
            }))
            .collect::<Vec<_>>();
        if !search_events.is_empty() {
            self.sqs
                .bulk_send_message_to_search_event_queue(std::mem::take(&mut search_events))
                .await
                .inspect_err(|error| tracing::error!(error = ?error, "unable to enqueue permanent deletion search events"))
                .ok();
        }
        if !documents.is_empty() {
            self.sqs
                .bulk_enqueue_document_delete_with_owner(documents.clone())
                .await
                .inspect_err(
                    |error| tracing::error!(error = ?error, "unable to enqueue document deletion"),
                )
                .ok();
        }

        Ok(Self::refs(EntityType::Project, project_ids)
            .chain(Self::refs(EntityType::Document, owned_document_ids))
            .chain(Self::refs(EntityType::Chat, chat_ids))
            .collect())
    }

    async fn restore_document(
        &self,
        _actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError> {
        let document = macro_db_client::document::get_basic_document(&self.db, &entity.entity_id)
            .await
            .map_err(|error| match error {
                sqlx::Error::RowNotFound => LegacyEntityMutationError::NotFound,
                error => LegacyEntityMutationError::Internal(rootcause::report!(error).into()),
            })?;
        macro_db_client::document::revert_delete::revert_delete_document(
            &self.db,
            &entity.entity_id,
            document.project_id.as_deref(),
        )
        .await
        .map_err(|error| LegacyEntityMutationError::Internal(rootcause::report!(error).into()))?;
        Ok(document
            .project_id
            .into_iter()
            .map(|id| EntityRef::new(EntityType::Project, id))
            .collect())
    }

    async fn delete_document_permanently(
        &self,
        _actor: &EntityMutationActor,
        entity: &EntityRef,
    ) -> Result<Vec<EntityRef>, LegacyEntityMutationError> {
        let document = macro_db_client::document::get_basic_document(&self.db, &entity.entity_id)
            .await
            .map_err(|error| match error {
                sqlx::Error::RowNotFound => LegacyEntityMutationError::NotFound,
                error => LegacyEntityMutationError::Internal(rootcause::report!(error).into()),
            })?;
        if document.file_type.as_deref() == Some("docx") {
            let bom_parts = macro_db_client::document::get_bom_parts(&self.db, &entity.entity_id)
                .await
                .map_err(|error| {
                    LegacyEntityMutationError::Internal(rootcause::report!(error).into())
                })?;
            self.redis
                .decrement_counts(&count_occurrences(
                    bom_parts.into_iter().map(|part| part.sha).collect(),
                ))
                .await
                .map_err(|error| {
                    LegacyEntityMutationError::Internal(rootcause::report!(error).into())
                })?;
        }
        macro_db_client::document::delete_document(&self.db, &entity.entity_id)
            .await
            .map_err(|error| {
                LegacyEntityMutationError::Internal(rootcause::report!(error).into())
            })?;
        comms_db_client::entity_mentions::delete_entity_mentions_by_source(
            &self.db,
            vec![entity.entity_id.clone()],
        )
        .await
        .inspect_err(|error| tracing::error!(error = ?error, "unable to delete entity mentions"))
        .ok();
        self.sqs
            .enqueue_document_delete(document.owner.as_ref(), &entity.entity_id)
            .await
            .map_err(|error| {
                LegacyEntityMutationError::Internal(rootcause::report!(error).into())
            })?;
        self.sqs
            .send_message_to_search_event_queue(SearchQueueMessage::RemoveDocument(DocumentId {
                document_id: entity.entity_id.clone(),
            }))
            .await
            .map_err(|error| {
                LegacyEntityMutationError::Internal(rootcause::report!(error).into())
            })?;
        Ok(document
            .project_id
            .into_iter()
            .map(|id| EntityRef::new(EntityType::Project, id))
            .collect())
    }
}
