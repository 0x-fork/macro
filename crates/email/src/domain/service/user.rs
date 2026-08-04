use crate::domain::{
    models::{EmailErr, InboxUnreadSignalCount, LinkLabel, UserEmailLink},
    ports::{EmailUserRepo, EmailUserService},
};
use macro_user_id::user_id::MacroUserIdStr;
use std::collections::HashMap;

use super::EmailServiceImpl;

#[cfg(test)]
mod test;

impl<T, U, E, CS, Eam, B> EmailUserService for EmailServiceImpl<T, U, E, CS, Eam, B>
where
    T: EmailUserRepo,
    U: Send + Sync + 'static,
    E: Send + Sync + 'static,
    CS: Send + Sync + 'static,
    Eam: Send + Sync + 'static,
    B: Send + Sync + 'static,
{
    async fn get_user_email_labels(
        &self,
        macro_id: MacroUserIdStr<'static>,
    ) -> Result<Vec<LinkLabel>, EmailErr> {
        let inboxes = self.email_repo.user_accessible_inboxes(macro_id).await?;
        let mut labels = Vec::new();

        // Preserve the REST analog's stable inbox order and each inbox's
        // repository-defined label order while aggregating owned and delegated
        // inboxes in the domain service.
        for inbox in inboxes {
            labels.extend(self.email_repo.user_labels_for_link(inbox.id).await?);
        }

        Ok(labels)
    }

    async fn get_user_email_links(
        &self,
        macro_id: MacroUserIdStr<'static>,
    ) -> Result<Vec<UserEmailLink>, EmailErr> {
        Ok(self
            .email_repo
            .user_inbox_details(macro_id)
            .await?
            .into_iter()
            .map(UserEmailLink::from)
            .collect())
    }

    async fn get_user_unread_signal_counts(
        &self,
        macro_id: MacroUserIdStr<'static>,
    ) -> Result<Vec<InboxUnreadSignalCount>, EmailErr> {
        let inboxes = self.email_repo.user_accessible_inboxes(macro_id).await?;
        if inboxes.is_empty() {
            return Ok(Vec::new());
        }

        let link_ids: Vec<_> = inboxes.iter().map(|inbox| inbox.id).collect();
        let counted: HashMap<_, _> = self
            .email_repo
            .unread_signal_counts_for_links(&link_ids)
            .await?
            .into_iter()
            .map(|count| (count.link_id, count.unread_count))
            .collect();

        // One entry per accessible inbox, in the repository's inbox order: a
        // caught-up inbox reports 0 rather than vanishing, so the client can
        // clear a stale badge without inferring absence.
        Ok(link_ids
            .into_iter()
            .map(|link_id| InboxUnreadSignalCount {
                link_id,
                unread_count: counted.get(&link_id).copied().unwrap_or(0),
            })
            .collect())
    }
}
