use crate::domain::{
    models::{
        AdvancedSortParams, FrecencyQueryInner, FrecencySoupItem, SimpleQueryInner,
        SimpleSortQuery, SimpleSortRequest, SoupErr, SoupQuery, SoupRequest, SoupType,
    },
    ports::{SoupOutput, SoupRepo, SoupService},
};
use crate::outbound::pg_soup_repo::reminders::ReminderRow;
use comms::domain::{models::GetChannelsRequest, ports::ChannelsService};
use cowlike::CowLike;
use doppleganger::Mirror;
use either::Either;
use email::domain::{
    models::{EnrichedEmailThreadPreview, GetEmailsRequest},
    ports::EmailService,
};
use frecency::domain::{
    models::{AggregateId, FrecencyPageRequest, JoinFrecency},
    ports::FrecencyQueryService,
};
use item_filters::{EntityFilters, ast::EntityFilterAst};
use macro_user_id::user_id::MacroUserIdStr;
use models_pagination::{
    Cursor, CursorVal, Frecency, FrecencyValue, PaginateOn, Query, SimpleSortMethod,
};
use models_soup::{
    comms::SoupChannel,
    email_thread::{
        SoupAttachment, SoupContact, SoupEmailThreadPreview, SoupEnrichedEmailThreadPreview,
        SoupLabel,
    },
    item::SoupItem,
};
use non_empty::IsEmpty;
use std::cmp::Ordering;
use uuid::Uuid;

#[cfg(test)]
mod tests;

/// struct which handles the actual implementation of soup with abstracted interfaces for mocking
pub struct SoupImpl<T, U, V, C> {
    /// the interface for interacting with the db
    soup_storage: T,
    /// the interface for interacting with frecency
    frecency: U,
    /// the interface for interacting with email
    email_service: V,
    /// the interface for interacting with comms
    comms_service: C,
}

impl<T, U, V, C> SoupImpl<T, U, V, C>
where
    T: SoupRepo,
    anyhow::Error: From<T::Err>,
    U: FrecencyQueryService,
    V: EmailService,
    C: ChannelsService,
{
    pub fn new(soup_storage: T, frecency: U, email_service: V, comms_service: C) -> Self {
        SoupImpl {
            soup_storage,
            frecency,
            email_service,
            comms_service,
        }
    }

    #[tracing::instrument(err, skip(self, req))]
    async fn handle_simple_request(
        &self,
        soup_type: SoupType,
        req: SimpleSortRequest<'_>,
    ) -> Result<impl Iterator<Item = FrecencySoupItem>, SoupErr> {
        let res = match soup_type {
            SoupType::Expanded => self
                .soup_storage
                .expanded_generic_cursor_soup(req)
                .await
                .map_err(anyhow::Error::from)?,
            SoupType::UnExpanded => self
                .soup_storage
                .unexpanded_generic_cursor_soup(req)
                .await
                .map_err(anyhow::Error::from)?,
        };

        Ok(res.into_iter().map(|item| FrecencySoupItem {
            item,
            frecency_score: None,
            reminder_metadata: None,
        }))
    }

    #[tracing::instrument(skip(self, req))]
    async fn handle_soup_by_ids(
        &self,
        soup_type: SoupType,
        req: AdvancedSortParams<'_>,
    ) -> Result<Vec<SoupItem>, T::Err> {
        match soup_type {
            SoupType::Expanded => self.soup_storage.expanded_soup_by_ids(req).await,
            SoupType::UnExpanded => self.soup_storage.unexpanded_soup_by_ids(req).await,
        }
    }

    /// enriches a frecency response with further soup data if the initial results length was not long enough
    #[tracing::instrument(err, skip(self, frecency_items))]
    async fn fallback_soup_data(
        &self,
        soup_type: SoupType,
        user: MacroUserIdStr<'_>,
        frecency_items: impl ExactSizeIterator<Item = FrecencySoupItem>,
        limit: u16,
    ) -> Result<impl Iterator<Item = FrecencySoupItem>, SoupErr> {
        let len = frecency_items.len();
        let remainder_to_fetch = (limit as usize).saturating_sub(len);

        let updated_at_soup = self
            .handle_simple_request(
                soup_type,
                SimpleSortRequest {
                    limit: remainder_to_fetch.try_into().unwrap_or(500),
                    cursor: SimpleSortQuery::FilterFrecency(Query::Sort(
                        SimpleSortMethod::UpdatedAt,
                        Frecency,
                    )),
                    user_id: user,
                },
            )
            .await?;
        Ok(frecency_items.chain(updated_at_soup))
    }

    #[tracing::instrument(err, skip(self, cursor))]
    async fn handle_advanced_sort(
        &self,
        cursor: Query<Uuid, Frecency, Option<EntityFilterAst>>,
        soup_type: SoupType,
        user: MacroUserIdStr<'static>,
        limit: u16,
    ) -> Result<impl Iterator<Item = FrecencySoupItem>, SoupErr> {
        let from_score = match cursor {
            Query::Sort(_, _) => None,
            Query::Cursor(Cursor {
                val:
                    CursorVal {
                        sort_type: Frecency,
                        last_val: FrecencyValue::FrecencyScore(score),
                    },
                filter,
                ..
            }) => Some((score, filter)),
            // we have passed all the frecency values on this cursor so we pull from updated at
            Query::Cursor(Cursor {
                id,
                limit: cursor_limit,
                val:
                    CursorVal {
                        sort_type: Frecency,
                        last_val: FrecencyValue::UpdatedAt(updated),
                    },
                filter,
            }) => {
                return Ok(Either::Left(
                    self.handle_simple_request(
                        soup_type,
                        SimpleSortRequest {
                            limit,
                            cursor: match filter {
                                // the input has no ast filter, just filter out items with frecency score and sort by update at
                                None => SimpleSortQuery::FilterFrecency(Query::Cursor(Cursor {
                                    id,
                                    limit: cursor_limit,
                                    val: CursorVal {
                                        sort_type: SimpleSortMethod::UpdatedAt,
                                        last_val: updated,
                                    },
                                    filter: Frecency,
                                })),
                                // the input has an ast filter, we need to filter out items that have a frecency score and also items that don't match the filter
                                Some(ast) => {
                                    SimpleSortQuery::ItemsAndFrecencyFilter(Query::Cursor(Cursor {
                                        id,
                                        limit: cursor_limit,
                                        val: CursorVal {
                                            sort_type: SimpleSortMethod::UpdatedAt,
                                            last_val: updated,
                                        },
                                        filter: (Frecency, ast),
                                    }))
                                }
                            },
                            user_id: user,
                        },
                    )
                    .await?,
                ));
            }
        };

        Ok(Either::Right(
            self.handle_frecency_cursor(from_score, soup_type, user, limit)
                .await?,
        ))
    }

    #[tracing::instrument(err, skip(self, from_value))]
    async fn handle_frecency_cursor(
        &self,
        from_value: Option<(f64, Option<EntityFilterAst>)>,
        soup_type: SoupType,
        user: MacroUserIdStr<'static>,
        limit: u16,
    ) -> Result<impl Iterator<Item = FrecencySoupItem>, SoupErr> {
        let (from_score, filters) = match from_value {
            None => (None, None),
            Some((s, f)) => (Some(s), f),
        };

        let res = self
            .frecency
            .get_frecency_page(FrecencyPageRequest {
                user_id: user.copied(),
                from_score,
                limit: limit as u32,
                filters,
            })
            .await?;

        let entities: Vec<_> = res.ids().map(|f| f.entity.copied()).collect();

        let res = self
            .handle_soup_by_ids(
                soup_type,
                AdvancedSortParams {
                    entities: &entities,
                    user_id: user.copied(),
                },
            )
            .await
            .map_err(anyhow::Error::from)?
            .into_iter()
            .join_frecency(res, |id| AggregateId {
                entity: id.entity(),
                user_id: user.copied().into_owned(),
            })
            .into_iter()
            .map(|(soup_item, frecency)| FrecencySoupItem {
                item: soup_item,
                frecency_score: Some(frecency),
                reminder_metadata: None,
            });

        Ok(match res.len().cmp(&(limit as usize)) {
            // use either to avoid boxing for dynamic dispatch
            Ordering::Less => {
                Either::Left(self.fallback_soup_data(soup_type, user, res, limit).await?)
            }
            Ordering::Greater | Ordering::Equal => Either::Right(res),
        })
    }

    #[tracing::instrument(err, skip(self, req))]
    async fn handle_email_request(
        &self,
        req: Option<GetEmailsRequest>,
    ) -> Result<impl Iterator<Item = FrecencySoupItem>, SoupErr> {
        use frecency::domain::models::AggregateFrecency;

        let Some(req) = req else {
            return Ok(Either::Left(None.into_iter()));
        };

        let email_response = self.email_service.get_email_thread_previews(req).await?;

        let mut frecency_scores: Vec<Option<AggregateFrecency>> =
            Vec::with_capacity(email_response.items.len());
        let mut items: Vec<SoupItem> = email_response
            .items
            .into_iter()
            .map(
                |EnrichedEmailThreadPreview {
                     thread,
                     attachments,
                     labels,
                     mut frecency_score,
                     participants,
                     ..
                 }| {
                    frecency_scores.push(frecency_score.take());
                    let soup_email = SoupEnrichedEmailThreadPreview {
                        thread: SoupEmailThreadPreview::mirror(thread),
                        attachments: Vec::<SoupAttachment>::mirror(attachments),
                        participants: Vec::<SoupContact>::mirror(participants),
                        labels: Vec::<SoupLabel>::mirror(labels),
                        properties: Default::default(),
                    };
                    SoupItem::EmailThread(soup_email)
                },
            )
            .collect();

        self.soup_storage
            .populate_properties(&mut items)
            .await
            .map_err(anyhow::Error::from)?;

        let emails_with_props: Vec<FrecencySoupItem> = items
            .into_iter()
            .zip(frecency_scores)
            .map(|(item, frecency_score)| FrecencySoupItem {
                item,
                frecency_score,
                reminder_metadata: None,
            })
            .collect();

        Ok(Either::Right(emails_with_props.into_iter()))
    }

    #[tracing::instrument(err, skip(self, req))]
    async fn handle_comms_request(
        &self,
        req: Option<GetChannelsRequest>,
    ) -> Result<impl Iterator<Item = FrecencySoupItem>, SoupErr> {
        let Some(req) = req else {
            return Ok(Either::Left(None.into_iter()));
        };

        Ok(Either::Right(
            self.comms_service
                .get_channels(req)
                .await
                .map_err(|_| SoupErr::CommsErr)
                .map(|r| {
                    r.into_iter().map(|mut c| {
                        let frecency_score = c.frecency_score.take();
                        let soup_channel = SoupChannel::mirror(c);
                        FrecencySoupItem {
                            item: SoupItem::Channel(soup_channel),
                            frecency_score,
                            reminder_metadata: None,
                        }
                    })
                })?,
        ))
    }
}

impl<T, U, V, C> SoupService for SoupImpl<T, U, V, C>
where
    T: SoupRepo,
    anyhow::Error: From<T::Err>,
    U: FrecencyQueryService,
    V: EmailService,
    C: ChannelsService,
{
    #[tracing::instrument(err, skip(self))]
    async fn get_user_soup(&self, req: SoupRequest<EntityFilters>) -> Result<SoupOutput, SoupErr> {
        let entity_filter = req.filters().clone();
        let reminder_filters = entity_filter.reminder_filters.clone();
        let limit = req.limit.clamp(20, 500);

        println!("asdf reminder_filters: {:?}", reminder_filters);
        println!(
            "asdf reminder_filters.is_empty(): {}",
            reminder_filters.is_empty()
        );

        // Step 1: Fetch reminder rows (sequential — we need entity IDs before other queries)
        let reminder_rows = if reminder_filters.is_empty() {
            println!("asdf skipping reminder fetch — filters empty");
            vec![]
        } else {
            let rows = self
                .soup_storage
                .get_reminders(
                    req.user.copied(),
                    &reminder_filters.reminder_ids,
                    reminder_filters.done,
                    limit,
                )
                .await
                .map_err(anyhow::Error::from)?;
            println!("asdf fetched {} reminder rows", rows.len());
            for r in &rows {
                println!(
                    "asdf   reminder row: id={}, entity_type={}, entity_id={}, reminder_time={}",
                    r.id, r.entity_type, r.entity_id, r.reminder_time
                );
            }
            rows
        };

        // Step 2: Build entity list for fetching reminder entities by ID
        let reminder_entities: Vec<_> = reminder_rows
            .iter()
            .map(|r| reminder_row_to_entity(r))
            .collect();
        println!("asdf reminder_entities to fetch: {:?}", reminder_entities);

        // Step 3: Convert filters to AST (unmodified) and build sub-requests
        let req = req.into_ast()?;
        let email_request = req.build_email_request();
        let comms_request = req.build_comms_request();
        println!(
            "asdf has email_request: {}, has comms_request: {}",
            email_request.is_some(),
            comms_request.is_some()
        );

        match req.cursor {
            SoupQuery::Simple(SimpleQueryInner(cursor)) => {
                let sort_method = *cursor.sort_method();
                println!("asdf Simple path, sort_method={:?}", sort_method);

                let main_soup_fut = self.handle_simple_request(
                    req.soup_type,
                    SimpleSortRequest {
                        limit,
                        cursor: SimpleSortQuery::from_entity_cursor(cursor),
                        user_id: req.user.copied(),
                    },
                );
                let email_soup_fut = self.handle_email_request(email_request);
                let comms_soup_fut = self.handle_comms_request(comms_request);

                // Fetch reminder entities separately by ID (runs in parallel with other queries)
                let reminder_soup_fut = async {
                    if reminder_entities.is_empty() {
                        println!("asdf no reminder entities to fetch by ID");
                        return Ok(Vec::new());
                    }
                    println!(
                        "asdf fetching {} reminder entities by ID",
                        reminder_entities.len()
                    );
                    let result = self
                        .handle_soup_by_ids(
                            req.soup_type,
                            AdvancedSortParams {
                                entities: &reminder_entities,
                                user_id: req.user.copied(),
                            },
                        )
                        .await
                        .map_err(anyhow::Error::from);
                    match &result {
                        Ok(items) => {
                            println!("asdf reminder soup_by_ids returned {} items", items.len());
                            for item in items {
                                println!("asdf   reminder soup item: entity={:?}", item.entity());
                            }
                        }
                        Err(e) => println!("asdf reminder soup_by_ids error: {:?}", e),
                    }
                    result
                };

                let (main_soup, email_soup, comms_soup, reminder_soup) = tokio::join!(
                    main_soup_fut,
                    email_soup_fut,
                    comms_soup_fut,
                    reminder_soup_fut,
                );

                let main_soup_items: Vec<_> = main_soup?.collect();
                let email_soup_items: Vec<_> = email_soup?.collect();
                let comms_soup_items: Vec<_> = comms_soup?.collect();
                let reminder_soup_items: Vec<_> = reminder_soup?
                    .into_iter()
                    .map(|item| FrecencySoupItem {
                        item,
                        frecency_score: None,
                        reminder_metadata: None,
                    })
                    .collect();

                println!(
                    "asdf main_soup: {} items, email_soup: {} items, comms_soup: {} items, reminder_soup: {} items",
                    main_soup_items.len(),
                    email_soup_items.len(),
                    comms_soup_items.len(),
                    reminder_soup_items.len()
                );

                let total_before_paginate = main_soup_items.len()
                    + email_soup_items.len()
                    + comms_soup_items.len()
                    + reminder_soup_items.len();
                println!(
                    "asdf total items before pagination: {}",
                    total_before_paginate
                );

                let mut page = main_soup_items
                    .into_iter()
                    .chain(email_soup_items)
                    .chain(comms_soup_items)
                    .chain(reminder_soup_items)
                    .paginate_on(limit.into(), sort_method)
                    .filter_on(entity_filter)
                    .sort_desc()
                    .into_page();

                println!("asdf items after pagination: {}", page.items.len());
                for item in &page.items {
                    println!("asdf   paginated item: entity={:?}", item.item.entity());
                }

                // Step 4: Annotate paginated items with reminder metadata
                annotate_reminder_metadata(&mut page.items, &reminder_rows);

                let annotated_count = page
                    .items
                    .iter()
                    .filter(|i| i.reminder_metadata.is_some())
                    .count();
                println!("asdf items with reminder_metadata: {}", annotated_count);

                Ok(Either::Left(page))
            }
            SoupQuery::Frecency(FrecencyQueryInner(cursor)) => {
                // For frecency path, fetch reminder entities and merge after
                let reminder_items: Vec<SoupItem> = if reminder_entities.is_empty() {
                    Vec::new()
                } else {
                    self.handle_soup_by_ids(
                        req.soup_type,
                        AdvancedSortParams {
                            entities: &reminder_entities,
                            user_id: req.user.copied(),
                        },
                    )
                    .await
                    .map_err(anyhow::Error::from)?
                };

                let mut page = self
                    .handle_advanced_sort(cursor, req.soup_type, req.user, limit)
                    .await?
                    .chain(reminder_items.into_iter().map(|item| FrecencySoupItem {
                        item,
                        frecency_score: None,
                        reminder_metadata: None,
                    }))
                    .paginate_on(limit.into(), Frecency)
                    .filter_on(entity_filter)
                    .into_page();

                annotate_reminder_metadata(&mut page.items, &reminder_rows);

                Ok(Either::Right(page))
            }
        }
    }
}

/// Converts a [ReminderRow] into an [Entity] for fetching via `soup_by_ids`.
fn reminder_row_to_entity(row: &ReminderRow) -> model_entity::Entity<'static> {
    use model_entity::EntityType;
    use std::str::FromStr;

    let entity_type = EntityType::from_str(&row.entity_type).unwrap_or(EntityType::Document);
    entity_type.with_entity_string(row.entity_id.to_string())
}

/// Annotates paginated items with reminder metadata for any items whose entity
/// matches a fetched reminder row.
fn annotate_reminder_metadata(items: &mut [FrecencySoupItem], rows: &[ReminderRow]) {
    use std::collections::HashMap;

    if rows.is_empty() {
        return;
    }

    // Build lookup: (entity_type, entity_id) → first matching ReminderRow
    let mut lookup: HashMap<(&str, Uuid), &ReminderRow> = HashMap::new();
    for row in rows {
        lookup
            .entry((row.entity_type.as_str(), row.entity_id))
            .or_insert(row);
    }

    for item in items.iter_mut() {
        let (entity_type_str, entity_id) = match &item.item {
            SoupItem::Document(d) => ("document", d.id),
            SoupItem::Chat(c) => ("chat", c.id),
            SoupItem::Project(p) => ("project", p.id),
            SoupItem::EmailThread(e) => ("email_thread", e.thread.id),
            SoupItem::Channel(ch) => ("channel", ch.channel.channel.id.0),
        };

        if let Some(row) = lookup.get(&(entity_type_str, entity_id)) {
            item.reminder_metadata = Some(models_soup::reminder::ReminderMetadata {
                reminder_id: row.id,
                reminder_time: row.reminder_time,
                done_time: row.done_time,
            });
        }
    }
}
