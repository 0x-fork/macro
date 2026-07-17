//! Lazy common-entity content reader for GraphQL.

use std::{collections::HashMap, sync::Arc};

use complete_graph::{EntityContentEdgeReader, EntityContentKey};
use documents_hex::domain::ports::DocumentService;
use entity_access::domain::{
    models::{AccessError, ViewAccessLevel},
    ports::EntityAccessService,
};
use futures::{StreamExt, stream};
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::EntityType;

/// DSS implementation of the lazy common content edge.
pub struct DssEntityContentReader<D, A> {
    documents: Arc<D>,
    access: Arc<A>,
}

impl<D, A> DssEntityContentReader<D, A> {
    /// Compose the reader from document and access domain services.
    pub fn new(documents: Arc<D>, access: Arc<A>) -> Self {
        Self { documents, access }
    }
}

#[async_trait::async_trait]
impl<D, A> EntityContentEdgeReader for DssEntityContentReader<D, A>
where
    D: DocumentService,
    A: EntityAccessService,
{
    async fn get_entity_content(
        &self,
        user_id: &MacroUserIdStr<'static>,
        organization_id: Option<i64>,
        keys: Vec<EntityContentKey>,
    ) -> Result<HashMap<EntityContentKey, Option<String>>, rootcause::Report> {
        let results = stream::iter(keys.into_iter().map(|key| async move {
            if key.entity_type != EntityType::Document {
                return Ok((key, None));
            }
            let receipt = match self
                .access
                .generate_entity_access_receipt::<ViewAccessLevel>(
                    user_id,
                    organization_id,
                    &key.entity_id,
                    key.entity_type,
                )
                .await
            {
                Ok(receipt) => receipt,
                Err(
                    AccessError::Unauthorized
                    | AccessError::UnauthorizedWithMessage(_)
                    | AccessError::NotFound(_),
                ) => return Ok((key, None)),
                Err(error) => return Err(rootcause::report!(error).into()),
            };
            let content = self
                .documents
                .get_document_text(receipt)
                .await
                .map_err(|error| -> rootcause::Report { rootcause::report!(error).into() })?;
            Ok((key, Some(content)))
        }))
        .buffer_unordered(8)
        .collect::<Vec<Result<_, rootcause::Report>>>()
        .await;

        results.into_iter().collect()
    }
}
