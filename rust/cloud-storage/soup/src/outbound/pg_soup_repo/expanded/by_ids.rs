use crate::{
    map_soup_type,
    outbound::pg_soup_repo::{populate_properties, type_err},
};
use chrono::{DateTime, Utc};
use document_sub_type::DocumentSubType;
use macro_user_id::{cowlike::CowLike, user_id::MacroUserIdStr};
use model_entity::{Entity, EntityType};
use models_soup::{
    email_thread::{SoupEmailThreadPreview, SoupEnrichedEmailThreadPreview},
    item::SoupItem,
};
use sqlx::PgPool;
use std::str::FromStr;
use system_properties::{StatusOption, SystemPropertyKey};
use uuid::Uuid;

/// Returns objects that a user has EXPLICIT and IMPLICIT access to by their IDs, excluding project items.
///
/// This function returns all requested items the user can access, including those with inherited
/// permissions through project hierarchy. If a user has access to a project that contains
/// the requested items, those items WILL be included in the results even if the user doesn't
/// have explicit permissions on them. Project items themselves are excluded from results -
/// only documents and chats are returned. Results are sorted to match the input entity order.
#[tracing::instrument(err, skip(db, entities))]
pub async fn expanded_soup_by_ids<'a>(
    db: &PgPool,
    user_id: MacroUserIdStr<'_>,
    entities: impl IntoIterator<Item = &'a Entity<'a>>,
) -> Result<Vec<SoupItem>, sqlx::Error> {
    let mut document_ids = Vec::new();
    let mut chat_ids = Vec::new();
    let mut email_thread_ids = Vec::new();

    entities.into_iter().for_each(|e| match e.entity_type {
        EntityType::Chat => chat_ids.push(e.entity_id.to_string()),
        EntityType::Document => document_ids.push(e.entity_id.to_string()),
        EntityType::EmailThread => {
            email_thread_ids.push(Uuid::parse_str(&e.entity_id).unwrap_or_default())
        }
        EntityType::Project => {} // Projects are excluded from expanded soup
        _ => {}
    });

    if document_ids.is_empty() && chat_ids.is_empty() && email_thread_ids.is_empty() {
        return Ok(Vec::new());
    }

    // Fetch docs/chats and emails in parallel
    let doc_chat_fut = fetch_docs_and_chats(db, user_id.copied(), &document_ids, &chat_ids);
    let email_fut = fetch_email_threads_by_ids(db, &email_thread_ids, user_id.copied());

    let (doc_chat_result, email_result) = tokio::join!(doc_chat_fut, email_fut);

    let mut items = doc_chat_result?;
    items.extend(email_result?);

    populate_properties(db, &mut items).await?;

    Ok(items)
}

async fn fetch_docs_and_chats(
    db: &PgPool,
    user_id: MacroUserIdStr<'_>,
    document_ids: &[String],
    chat_ids: &[String],
) -> Result<Vec<SoupItem>, sqlx::Error> {
    if document_ids.is_empty() && chat_ids.is_empty() {
        return Ok(Vec::new());
    }

    let status_property_id = SystemPropertyKey::STATUS_UUID;
    let completed_option_id = StatusOption::COMPLETED_UUID.to_string();

    sqlx::query!(
        r#"
        WITH RECURSIVE ProjectHierarchy AS (
            SELECT p.id, uia.access_level
            FROM "Project" p
            JOIN "UserItemAccess" uia ON p.id = uia.item_id AND uia.item_type = 'project'
            WHERE uia.user_id = $1 AND p."deletedAt" IS NULL
            UNION ALL
            SELECT p.id, ph.access_level
            FROM "Project" p
            JOIN ProjectHierarchy ph ON p."parentId" = ph.id
            WHERE p."deletedAt" IS NULL
        ),
        AllAccessGrants AS (
            SELECT item_id, item_type, access_level
            FROM "UserItemAccess"
            WHERE user_id = $1
            UNION ALL
            SELECT d.id AS item_id, 'document' AS item_type, ph.access_level
            FROM "Document" d
            JOIN ProjectHierarchy ph ON d."projectId" = ph.id
            WHERE d."projectId" IS NOT NULL AND d."deletedAt" IS NULL
            UNION ALL
            SELECT c.id AS item_id, 'chat' AS item_type, ph.access_level
            FROM "Chat" c
            JOIN ProjectHierarchy ph ON c."projectId" = ph.id
            WHERE c."projectId" IS NOT NULL AND c."deletedAt" IS NULL
            UNION ALL
            SELECT ph.id AS item_id, 'project' AS item_type, ph.access_level
            FROM ProjectHierarchy ph
        ),
        UserAccessibleItems AS (
            SELECT DISTINCT ON (item_id, item_type) item_id, item_type
            FROM AllAccessGrants
            ORDER BY item_id, item_type,
                CASE access_level
                    WHEN 'owner' THEN 4
                    WHEN 'edit' THEN 3
                    WHEN 'comment' THEN 2
                    WHEN 'view' THEN 1
                    ELSE 0
                END DESC
        ),
        Combined AS (
            SELECT
                'document' as "item_type!",
                d.id as "id!",
                CAST(COALESCE(di.id, db.id) as TEXT) as "document_version_id",
                d.owner as "user_id!",
                d.name as "name!",
                d."branchedFromId" as "branched_from_id",
                d."branchedFromVersionId" as "branched_from_version_id",
                d."documentFamilyId" as "document_family_id",
                d."fileType" as "file_type",
                d."createdAt"::timestamptz as "created_at!",
                d."updatedAt"::timestamptz as "updated_at!",
                d."projectId" as "project_id",
                NULL as "is_persistent",
                di.sha as "sha",
                dt.sub_type as "sub_type?: DocumentSubType",
                uh."updatedAt"::timestamptz as "viewed_at",
                CASE
                    WHEN dt.sub_type = 'task'
                        AND ep_status.values->'value' ? $4
                    THEN true
                    WHEN dt.sub_type = 'task'
                    THEN false
                    ELSE NULL
                END as "is_completed",
                d."deletedAt"::timestamptz as "deleted_at"
            FROM "Document" d
            LEFT JOIN document_sub_type dt ON dt.document_id = d.id
            LEFT JOIN entity_properties ep_status
                ON dt.sub_type = 'task'
                AND ep_status.entity_id = d.id
                AND ep_status.entity_type = 'TASK'
                AND ep_status.property_definition_id = $5
            INNER JOIN UserAccessibleItems uai
                ON uai.item_id = d.id
                AND uai.item_type = 'document'
            LEFT JOIN "UserHistory" uh
                ON uh."itemId" = d.id
                AND uh."itemType" = 'document'
                AND uh."userId" = $1
            LEFT JOIN LATERAL (
                SELECT b.id
                FROM "DocumentBom" b
                WHERE b."documentId" = d.id
                ORDER BY b."createdAt" DESC
                LIMIT 1
            ) db ON true
            LEFT JOIN LATERAL (
                SELECT i.id, i.sha
                FROM "DocumentInstance" i
                WHERE i."documentId" = d.id
                ORDER BY i."updatedAt" DESC
                LIMIT 1
            ) di ON true
            WHERE d."deletedAt" IS NULL
            AND d.id = ANY($2::text[])

            UNION ALL

            SELECT
                'chat' as "item_type!",
                c.id as "id!",
                NULL as "document_version_id",
                c."userId" as "user_id!",
                c.name as "name!",
                NULL as "branched_from_id",
                NULL as "branched_from_version_id",
                NULL as "document_family_id",
                NULL as "file_type",
                c."createdAt"::timestamptz as "created_at!",
                c."updatedAt"::timestamptz as "updated_at!",
                c."projectId" as "project_id",
                c."isPersistent" as "is_persistent",
                NULL as "sha",
                NULL as "sub_type",
                uh."updatedAt"::timestamptz as "viewed_at",
                NULL as "is_completed",
                c."deletedAt"::timestamptz as "deleted_at"
            FROM "Chat" c
            INNER JOIN UserAccessibleItems uai
                ON uai.item_id = c.id
                AND uai.item_type = 'chat'
            LEFT JOIN "UserHistory" uh
                ON uh."itemId" = c.id
                AND uh."itemType" = 'chat'
                AND uh."userId" = $1
            WHERE c."deletedAt" IS NULL
            AND c.id = ANY($3::text[])
        )
        SELECT *
        FROM Combined
        "#,
        user_id.as_ref(),    // $1
        document_ids,        // $2
        chat_ids,            // $3
        completed_option_id, // $4
        status_property_id,  // $5
    )
    .try_map(map_soup_type!())
    .fetch_all(db)
    .await
}

/// Row type for the email thread by-IDs query.
struct EmailThreadRow {
    id: Uuid,
    provider_id: Option<String>,
    inbox_visible: bool,
    is_read: bool,
    is_draft: bool,
    is_important: bool,
    sort_ts: DateTime<Utc>,
    name: Option<String>,
    snippet: Option<String>,
    sender_email: Option<String>,
    sender_name: Option<String>,
    sender_photo_url: Option<String>,
    viewed_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

/// Fetches email thread previews by their IDs.
/// Adapted from the inbox preview query but filtered by specific thread IDs.
async fn fetch_email_threads_by_ids(
    db: &PgPool,
    thread_ids: &[Uuid],
    user_id: MacroUserIdStr<'_>,
) -> Result<Vec<SoupItem>, sqlx::Error> {
    if thread_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = sqlx::query_as!(
        EmailThreadRow,
        r#"
        WITH trash_label AS (
            SELECT id, link_id FROM email_labels WHERE name = 'TRASH'
        ),
        important_label AS (
            SELECT id, link_id FROM email_labels WHERE name = 'IMPORTANT'
        )
        SELECT
            t.id,
            t.provider_id,
            t.inbox_visible AS "inbox_visible!",
            t.is_read AS "is_read!",
            t.latest_inbound_message_ts AS "sort_ts!",
            t.latest_inbound_message_ts AS "created_at!",
            t.latest_inbound_message_ts AS "updated_at!",
            uh.updated_at AS "viewed_at?",
            lmp.subject AS "name?",
            lmp.snippet AS "snippet?",
            lmp.is_draft AS "is_draft!",
            EXISTS (
                SELECT 1
                FROM email_messages m_imp
                JOIN email_message_labels ml ON m_imp.id = ml.message_id
                WHERE m_imp.thread_id = t.id
                  AND ml.label_id = (SELECT id FROM important_label WHERE link_id = t.link_id)
            ) AS "is_important!",
            c.email_address AS "sender_email?",
            COALESCE(lmp.from_name, c.name) AS "sender_name?",
            c.sfs_photo_url AS "sender_photo_url?"
        FROM email_threads t
        CROSS JOIN LATERAL (
            SELECT
                m.subject,
                m.snippet,
                m.from_contact_id,
                m.from_name,
                m.is_draft
            FROM email_messages m
            WHERE m.thread_id = t.id
              AND NOT EXISTS (
                SELECT 1 FROM email_message_labels ml
                WHERE ml.message_id = m.id
                  AND ml.label_id = (SELECT id FROM trash_label WHERE link_id = t.link_id)
              )
            ORDER BY m.internal_date_ts DESC
            LIMIT 1
        ) AS lmp
        LEFT JOIN email_contacts c ON lmp.from_contact_id = c.id
        LEFT JOIN email_user_history uh ON uh.thread_id = t.id AND uh.link_id = t.link_id
        WHERE t.id = ANY($1)
          AND t.latest_inbound_message_ts IS NOT NULL
        "#,
        thread_ids,
    )
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| {
            SoupItem::EmailThread(SoupEnrichedEmailThreadPreview {
                thread: SoupEmailThreadPreview {
                    id: r.id,
                    provider_id: r.provider_id,
                    owner_id: user_id.copied().into_owned(),
                    inbox_visible: r.inbox_visible,
                    is_read: r.is_read,
                    is_draft: r.is_draft,
                    is_important: r.is_important,
                    name: r.name,
                    snippet: r.snippet,
                    sender_email: r.sender_email,
                    sender_name: r.sender_name,
                    sender_photo_url: r.sender_photo_url,
                    sort_ts: r.sort_ts,
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                    viewed_at: r.viewed_at,
                },
                attachments: Vec::new(),
                participants: Vec::new(),
                labels: Vec::new(),
                properties: Vec::new(),
            })
        })
        .collect())
}
