//! Default [`ChatService`] implementation backed by a [`ChatRepo`].

use crate::domain::{
    models::{ChatErr, CopyChatArgs, GetChatResponse, PatchChatArgs},
    ports::{ChatRepo, ChatService},
};
use entity_access::domain::models::{
    EditAccessLevel, EntityAccessAuth, EntityAccessReceipt, OwnerAccessLevel, ViewAccessLevel,
};
use macro_user_id::user_id::MacroUserIdStr;
use models_permissions::share_permission::SharePermissionV2;

/// Concrete service implementation that delegates to a [`ChatRepo`].
pub struct ChatServiceImpl<R> {
    repo: R,
}

impl<R: ChatRepo> ChatServiceImpl<R> {
    /// Create a new [`ChatServiceImpl`] wrapping the given repo.
    pub fn new(repo: R) -> Self {
        Self { repo }
    }
}

/// Extract the authenticated user ID from a receipt, or return an error.
fn authenticated_user_id(auth: &EntityAccessAuth) -> Result<MacroUserIdStr<'static>, ChatErr> {
    match auth {
        EntityAccessAuth::Authenticated(id) => Ok(id.clone()),
        _ => Err(ChatErr::Unknown(anyhow::anyhow!(
            "expected authenticated user"
        ))),
    }
}

impl<R: ChatRepo> ChatService for ChatServiceImpl<R> {
    #[tracing::instrument(err, skip(self))]
    async fn create(
        &self,
        user_id: MacroUserIdStr<'static>,
        args: crate::domain::models::CreateChatArgs,
    ) -> Result<String, ChatErr> {
        self.repo.create(user_id, args).await
    }

    #[tracing::instrument(err, skip(self, receipt))]
    async fn get_chat(
        &self,
        receipt: EntityAccessReceipt<ViewAccessLevel>,
    ) -> Result<GetChatResponse, ChatErr> {
        let chat_id = receipt.entity().entity_id.clone();
        let user_id = authenticated_user_id(receipt.auth())?;

        let (chat, access_level) = tokio::join!(
            self.repo.get_chat(&chat_id),
            self.repo.get_access_level(user_id, &chat_id),
        );

        Ok(GetChatResponse {
            chat: chat?,
            user_access_level: access_level?,
        })
    }

    #[tracing::instrument(err, skip(self, receipt))]
    async fn copy_chat(
        &self,
        receipt: EntityAccessReceipt<ViewAccessLevel>,
    ) -> Result<String, ChatErr> {
        let chat_id = receipt.entity().entity_id.clone();
        let user_id = authenticated_user_id(receipt.auth())?;
        let chat = self.repo.get_metadata(&chat_id).await?;
        self.repo
            .copy_chat(
                user_id,
                &chat_id,
                CopyChatArgs {
                    name: format!("{} Copy", chat.name),
                    project_id: None,
                },
            )
            .await
    }

    #[tracing::instrument(err, skip(self, receipt))]
    async fn delete(
        &self,
        receipt: EntityAccessReceipt<OwnerAccessLevel>,
    ) -> Result<(), ChatErr> {
        self.repo.delete(&receipt.entity().entity_id).await
    }

    #[tracing::instrument(err, skip(self, receipt))]
    async fn permanently_delete(
        &self,
        receipt: EntityAccessReceipt<OwnerAccessLevel>,
    ) -> Result<(), ChatErr> {
        self.repo
            .permanently_delete(&receipt.entity().entity_id)
            .await
    }

    #[tracing::instrument(err, skip(self, receipt))]
    async fn patch(
        &self,
        receipt: EntityAccessReceipt<OwnerAccessLevel>,
        args: PatchChatArgs,
    ) -> Result<(), ChatErr> {
        let chat_id = receipt.entity().entity_id.clone();
        let user_id = authenticated_user_id(receipt.auth())?;
        self.repo.patch(user_id, &chat_id, args).await
    }

    #[tracing::instrument(err, skip(self, receipt))]
    async fn revert_delete(
        &self,
        receipt: EntityAccessReceipt<OwnerAccessLevel>,
    ) -> Result<(), ChatErr> {
        let chat_id = receipt.entity().entity_id.clone();
        let chat = self.repo.get_metadata(&chat_id).await?;
        self.repo
            .revert_delete(&chat_id, chat.project_id.as_deref())
            .await
    }

    #[tracing::instrument(err, skip(self, receipt))]
    async fn get_permissions(
        &self,
        receipt: EntityAccessReceipt<EditAccessLevel>,
    ) -> Result<SharePermissionV2, ChatErr> {
        self.repo
            .get_permissions(&receipt.entity().entity_id)
            .await
    }
}
