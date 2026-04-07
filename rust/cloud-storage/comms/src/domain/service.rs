use std::{
    collections::{HashMap, HashSet},
    str::FromStr,
};

use frecency::domain::{models::AggregateFrecency, ports::AggregateFrecencyStorage};
use macro_user_id::cowlike::CowLike;
use model_entity::EntityType;
use models_comms::channel::{Activity, ChannelId, ChannelWithLatest};
use uuid::Uuid;

use entity_access::domain::models::{EntityAccessReceipt, OwnerParticipantRole};

use crate::domain::{
    models::{
        BotError, BotIntegration, CreateBotRequest, CreatedBot, GetChannelsRequest,
        channel_name::resolve_channel_name,
    },
    ports::{BotIntegrationRepo, ChannelsService, CommsRepo, UserRepo},
};

pub struct ChannelServiceImpl<Comms, Auth, Frec, Bots> {
    comms: Comms,
    auth: Auth,
    frecency: Frec,
    bots: Bots,
}

impl<Comms, Auth, Frec, Bots> ChannelServiceImpl<Comms, Auth, Frec, Bots>
where
    Comms: CommsRepo,
    Auth: UserRepo,
    Frec: AggregateFrecencyStorage,
    Bots: BotIntegrationRepo,
{
    pub fn new(comms: Comms, auth: Auth, frecency: Frec, bots: Bots) -> Self {
        ChannelServiceImpl {
            comms,
            auth,
            frecency,
            bots,
        }
    }
}

impl<Comms, Auth, Frec, Bots> ChannelsService for ChannelServiceImpl<Comms, Auth, Frec, Bots>
where
    Comms: CommsRepo,
    Auth: UserRepo,
    Frec: AggregateFrecencyStorage,
    Bots: BotIntegrationRepo,
{
    #[tracing::instrument(err, skip(self))]
    async fn get_channels(
        &self,
        req: GetChannelsRequest,
    ) -> Result<Vec<models_comms::channel::ChannelWithLatest>, rootcause::Report> {
        let params = req.into_params();
        let user = params.user().clone();

        let channels = self
            .comms
            .get_user_channels_with_participants(params)
            .await?;

        let channel_entities: Vec<_> = channels
            .iter()
            .map(|chan| EntityType::Channel.with_entity_string(chan.channel.id.0.to_string()))
            .collect();

        let channel_ids: Vec<_> = channels.iter().map(|chan| chan.channel.id).collect();

        let participant_ids: HashSet<_> = channels
            .iter()
            .flat_map(|chan| chan.participants.iter().map(|p| p.user_id.copied()))
            .collect();

        let (names, latest_messages, activities, frecency) = tokio::join!(
            self.auth.get_names_for_ids(participant_ids),
            self.comms.get_latest_channel_messages_batch(&channel_ids),
            self.comms.get_activities(user.copied()),
            self.frecency
                .get_aggregate_for_user_entities(user.clone(), channel_entities.as_slice())
        );

        let mut activity_lookup: HashMap<ChannelId, Activity> = activities
            .unwrap_or_default()
            .into_iter()
            .map(|a| (a.channel_id, a))
            .collect();

        let mut frecency_map: HashMap<ChannelId, AggregateFrecency> = frecency
            .unwrap_or_default()
            .into_iter()
            .filter_map(|f| Some((ChannelId(Uuid::from_str(&f.id.entity.entity_id).ok()?), f)))
            .collect();

        let name_lookup = names.map(|n| {
            n.into_iter()
                .filter_map(|n| {
                    let display = n.display_name()?;
                    Some((n.id, display))
                })
                .collect::<HashMap<_, _>>()
        })?;

        let mut latest_messages = latest_messages?;

        // Map a channel to its correct name and latest message
        let channels: Vec<ChannelWithLatest> = channels
        .into_iter()
        .map(|mut channel| {
            let resolved_name = resolve_channel_name(
                &channel.channel.channel_type,
                channel.channel.name.as_deref(),
                &channel.participants,
                &channel.channel.id,
                user.copied(),
                &name_lookup,
            );
            channel.channel.name = Some(resolved_name);
            let activity = activity_lookup.remove(&channel.channel.id);
            let viewed_at = activity.as_ref().and_then(|a| a.viewed_at);
            let interacted_at = activity.as_ref().and_then(|a| a.interacted_at);
            let channel_with_latest = ChannelWithLatest {
                channel: channel.clone(),
                latest_message: latest_messages.remove(&channel.channel.id).unwrap_or_default(),
                viewed_at,
                interacted_at,
                frecency_score: frecency_map.remove(&channel.channel.id)
            };

            tracing::trace!(channel_type=?channel.channel.channel_type,channel_name=?channel.channel.name, "resolved channel name");
            channel_with_latest
        })
        .collect();

        Ok(channels)
    }

    fn get_activities(
        &self,
        user: macro_user_id::user_id::MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Vec<Activity>, rootcause::Report>> + Send {
        self.comms.get_activities(user)
    }

    fn get_names(
        &self,
        names: HashSet<macro_user_id::user_id::MacroUserIdStr<'_>>,
    ) -> impl Future<Output = Result<Vec<super::models::UserName>, rootcause::Report>> + Send {
        self.auth.get_names_for_ids(names)
    }

    #[tracing::instrument(err, skip(self))]
    async fn get_integrations(&self) -> Result<Vec<BotIntegration>, rootcause::Report> {
        self.bots.get_all_integrations().await
    }

    #[tracing::instrument(err, skip(self, receipt))]
    async fn create_bot(
        &self,
        receipt: &EntityAccessReceipt<OwnerParticipantRole>,
        req: CreateBotRequest,
    ) -> Result<CreatedBot, BotError> {
        if req.name.is_empty() {
            return Err(BotError::Validation("bot name is required".into()));
        }
        if req.name.chars().count() > 32 {
            return Err(BotError::Validation(
                "bot name must not exceed 32 characters".into(),
            ));
        }

        let user_id = receipt
            .get_authenticated_user()
            .map_err(|_| BotError::Validation("authentication required".into()))?;
        let channel_id = Uuid::parse_str(&receipt.entity().entity_id)
            .map_err(|_| BotError::Validation("invalid channel_id".into()))?;

        // rand::rng() returns ThreadRng which is backed by a CSPRNG
        let bytes: [u8; 32] = rand::Rng::random(&mut rand::rng());
        let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();

        use sha2::{Digest, Sha256};
        let token_hash = format!("{:x}", Sha256::digest(token.as_bytes()));

        let mut created = self
            .bots
            .create_bot(channel_id, user_id.to_string(), &token_hash, req)
            .await
            .map_err(BotError::Internal)?;
        created.token = token;
        Ok(created)
    }
}
