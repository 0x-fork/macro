use std::collections::{HashMap, HashSet};

use macro_user_id::user_id::MacroUserIdStr;
use models_comms::channel::{
    Activity, ChannelId, ChannelWithLatest, ChannelWithParticipants, LatestMessage,
};
use rootcause::Report;
use uuid::Uuid;

use entity_access::domain::models::{EntityAccessReceipt, OwnerParticipantRole};

use crate::domain::models::{
    BotError, BotIntegration, CreateBotRequest, CreatedBot, GetChannelsParams, GetChannelsRequest,
    UserName,
};

pub trait CommsRepo: Send + Sync + 'static {
    fn get_user_channels_with_participants(
        &self,
        req: GetChannelsParams,
    ) -> impl Future<Output = Result<Vec<ChannelWithParticipants>, Report>> + Send;

    fn get_latest_channel_messages_batch(
        &self,
        channels: &[ChannelId],
    ) -> impl Future<Output = Result<HashMap<ChannelId, LatestMessage>, Report>> + Send;

    fn get_activities(
        &self,
        user_id: MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Vec<Activity>, Report>> + Send;
}

pub trait UserRepo: Send + Sync + 'static {
    fn get_names_for_ids(
        &self,
        names: HashSet<MacroUserIdStr<'_>>,
    ) -> impl Future<Output = Result<Vec<UserName>, Report>> + Send;
}

pub trait BotIntegrationRepo: Send + Sync + 'static {
    /// Returns all available bot integrations.
    fn get_all_integrations(
        &self,
    ) -> impl Future<Output = Result<Vec<BotIntegration>, Report>> + Send;

    /// Creates a new channel webhook with the given token hash.
    fn create_bot(
        &self,
        channel_id: Uuid,
        created_by: String,
        token_hash: &str,
        req: CreateBotRequest,
    ) -> impl Future<Output = Result<CreatedBot, Report>> + Send;
}

pub trait ChannelsService: Send + Sync + 'static {
    fn get_channels(
        &self,
        req: GetChannelsRequest,
    ) -> impl Future<Output = Result<Vec<ChannelWithLatest>, Report>> + Send;

    fn get_activities(
        &self,
        user: MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Vec<Activity>, Report>> + Send;

    fn get_names(
        &self,
        names: HashSet<MacroUserIdStr<'_>>,
    ) -> impl Future<Output = Result<Vec<UserName>, Report>> + Send;

    fn get_integrations(&self) -> impl Future<Output = Result<Vec<BotIntegration>, Report>> + Send;

    fn create_bot(
        &self,
        receipt: &EntityAccessReceipt<OwnerParticipantRole>,
        req: CreateBotRequest,
    ) -> impl Future<Output = Result<CreatedBot, BotError>> + Send;
}
