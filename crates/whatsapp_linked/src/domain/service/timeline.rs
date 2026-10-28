//! Authorized standalone timeline operations.
use super::*;
use entity_access::domain::models::{AccessLevel, EntityPermission};
use macro_user_id::user_id::MacroUserIdStr;
use models_permissions::share_permission::{
    SharePermissionV2, UpdateSharePermissionRequestV2,
    channel_share_permission::{UpdateChannelSharePermission, UpdateOperation},
    team_share::{TeamShareLevel, TeamShareRequest, authorize_team_share},
};
impl LinkedService {
    /// List all shared groups, including for viewers with no WhatsApp account.
    #[tracing::instrument(name = "whatsapp.linked.list", skip_all, err, fields(count))]
    pub async fn adopted_groups(
        &self,
        user: &MacroUserIdStr<'_>,
    ) -> LinkedResult<Vec<WhatsAppGroupSummary>> {
        let records = self.timeline.visible_groups(user).await?;
        let account = self.accounts.owned_account(user).await?;
        tracing::Span::current().record("count", records.len());
        Ok(records
            .into_iter()
            .map(|record| {
                let facts = account
                    .as_ref()
                    .map(|account| sending_facts(account, &record.binding, record.roster));
                let reason = reply_block(account.as_ref(), &record.binding, facts.as_ref());
                record.facts.summary(reason)
            })
            .collect())
    }
    /// Authorized group detail, standard sharing and own sending identity.
    #[tracing::instrument(name = "whatsapp.linked.detail", skip_all, err, fields(group_id))]
    pub async fn group_detail<T: RequiredPermission>(
        &self,
        access: &EntityAccessReceipt<T>,
    ) -> LinkedResult<WhatsAppGroupDetail> {
        let (user, id) = view_scope(access)?;
        tracing::Span::current().record("group_id", tracing::field::display(id));
        let binding = self
            .bindings
            .binding(id)
            .await?
            .ok_or(LinkedError::NotFound)?;
        // A bot viewer reads, but has no WhatsApp account of its own.
        let account = match access.get_authenticated_user() {
            Ok(person) => self.accounts.owned_account(person).await?,
            Err(_) => None,
        };
        let facts = self.timeline.group_facts(id, user).await?;
        let observers = self.groups.group_accounts(id, user).await?;
        self.groups.request_groups_refresh(&observers).await?;
        let reason = self.reply_block(account.as_ref(), &binding).await?;
        let access_level = match access.entity_permission() {
            EntityPermission::AccessLevel { access_level } => *access_level,
            _ => return Err(LinkedError::Forbidden.into()),
        };
        let roster = self.groups.binding_roster(&binding).await?;
        Ok(WhatsAppGroupDetail {
            group: facts.summary(reason),
            share_permission: self.timeline.permissions(id).await?,
            access_level,
            disappearing_seconds: roster.as_ref().and_then(|r| r.disappearing_seconds),
            roster: roster.as_ref().map(WhatsAppRoster::from),
            sending_identity: account.and_then(|a| a.identity_jid),
            limits: Capabilities::default(),
        })
    }
    /// Read the complete timeline through view access, without remote
    /// membership. `limit` defaults to [`DEFAULT_PAGE`], at most [`PAGE_LIMIT`].
    pub async fn messages<T: RequiredPermission>(
        &self,
        access: &EntityAccessReceipt<T>,
        before: Option<Uuid>,
        limit: Option<i64>,
    ) -> LinkedResult<WhatsAppGroupMessages> {
        let (user, id) = view_scope(access)?;
        let limit = limit.unwrap_or(DEFAULT_PAGE);
        if !(1..=PAGE_LIMIT).contains(&limit) {
            return Err(LinkedError::Invalid("the page size is out of range").into());
        }
        self.timeline.messages(id, user, before, limit).await
    }
    /// One message through view access, as the timeline shows it.
    pub async fn message<T: RequiredPermission>(
        &self,
        access: &EntityAccessReceipt<T>,
        message: Uuid,
    ) -> LinkedResult<WhatsAppGroupMessage> {
        let (user, id) = view_scope(access)?;
        self.timeline
            .message(id, user, message)
            .await?
            .ok_or_else(|| LinkedError::NotFound.into())
    }
    /// Advance the caller's own read cursor monotonically.
    #[tracing::instrument(name = "whatsapp.linked.read", skip_all, err, fields(group_id, message_id = %message))]
    pub async fn mark_read<T: RequiredPermission>(
        &self,
        access: &EntityAccessReceipt<T>,
        message: Uuid,
    ) -> LinkedResult<()> {
        let (user, id) = receipt_scope(access)?;
        tracing::Span::current().record("group_id", tracing::field::display(id));
        self.timeline.mark_read(id, user, message).await
    }
    /// List only the caller's pending, uncertain or failed sends.
    pub async fn open_sends<T: RequiredPermission>(
        &self,
        access: &EntityAccessReceipt<T>,
    ) -> LinkedResult<Vec<SendProgress>> {
        let (user, id) = receipt_scope(access)?;
        self.sends.open_sends(id, user).await
    }
    /// Read standard permission settings.
    pub async fn permissions<T: RequiredPermission>(
        &self,
        access: &EntityAccessReceipt<T>,
    ) -> LinkedResult<SharePermissionV2> {
        let (_, id) = view_scope(access)?;
        self.timeline.permissions(id).await
    }
    /// Only the actual owner, in a session of their own, controls link, team
    /// and channel sharing; ordinary people grants use the generic
    /// direct-access endpoints. Everything is shared read-only.
    #[tracing::instrument(name = "whatsapp.linked.permissions", skip_all, err, fields(group_id))]
    pub async fn update_permissions<T: RequiredPermission>(
        &self,
        access: &EntityAccessReceipt<T>,
        update: &UpdateSharePermissionRequestV2,
        authority: SendAuthority,
    ) -> LinkedResult<()> {
        human(authority)?;
        let (user, id) = receipt_scope(access)?;
        tracing::Span::current().record("group_id", tracing::field::display(id));
        let facts = self.timeline.share_facts(id).await?;
        if !facts.owner.is_user(user) {
            return Err(LinkedError::Forbidden.into());
        }
        if update
            .link_share_access_level
            .flatten()
            .is_some_and(|level| level != AccessLevel::View)
        {
            return Err(LinkedError::Invalid("WhatsApp chats are shared read-only").into());
        }
        validate_channel_grants(
            update
                .channel_share_permissions
                .as_deref()
                .unwrap_or_default(),
        )?;
        let command = authorize_team_share(
            Some(user),
            &facts,
            TeamShareRequest {
                access_level: update.team_share_access_level,
                legacy_enabled: None,
            },
            TeamShareLevel::View,
        )
        .map_err(|_| LinkedError::Forbidden)?;
        self.timeline
            .update_permissions(id, user, update, command.as_ref())
            .await
    }
}

/// Channel grants name each channel once and are read-only; a removal needs no
/// level.
fn validate_channel_grants(grants: &[UpdateChannelSharePermission]) -> LinkedResult<()> {
    let mut channels = std::collections::HashSet::new();
    for grant in grants {
        let read_only = match grant.operation {
            UpdateOperation::Remove => true,
            UpdateOperation::Add | UpdateOperation::Replace => {
                grant.access_level == Some(AccessLevel::View)
            }
        };
        if !channels.insert(&grant.channel_id)
            || Uuid::parse_str(&grant.channel_id).is_err()
            || !read_only
        {
            return Err(
                LinkedError::Invalid("WhatsApp chats are shared read-only with a channel").into(),
            );
        }
    }
    Ok(())
}
