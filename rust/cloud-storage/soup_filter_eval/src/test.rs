use chrono::{DateTime, TimeZone, Utc};
use item_filters::ast::EntityFilterAst;
use item_filters::{CallStatus, EntityFilters};
use macro_user_id::cowlike::CowLike;
use macro_user_id::user_id::MacroUserIdStr;
use models_properties::service::property_definition::PropertyDefinition;
use models_properties::service::property_value::PropertyValue;
use models_properties::shared::{DataType, EntityReference, EntityType, PropertyOwner};
use models_soup::SoupProperty;
use models_soup::chat::SoupChat;
use models_soup::comms::{
    Channel, ChannelType, ChannelWithParticipants, LatestMessage, SoupChannel,
};
use models_soup::crm_company::SoupCrmCompany;
use models_soup::document::{SoupDocument, SoupDocumentSubType};
use models_soup::email_thread::{
    SoupAttachment, SoupContact, SoupEmailThreadPreview, SoupEnrichedEmailThreadPreview,
};
use models_soup::foreign_entity::SoupForeignEntity;
use models_soup::item::SoupItem;
use models_soup::project::SoupProject;
use serde_json::{Value, json};
use uuid::Uuid;

use super::*;

const USER: &str = "macro|user@example.com";
const OTHER_USER: &str = "macro|other@example.com";

fn user_id(s: &str) -> MacroUserIdStr<'static> {
    MacroUserIdStr::parse_from_str(s).unwrap().into_owned()
}

fn ts(s: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Utc)
}

fn eval(ast: &EntityFilterAst, item: &Value) -> Truth {
    eval_soup_item(ast, item, &EvalOptions::default()).unwrap()
}

/// Expand typed filters exactly like the soup endpoints do.
fn ast_from(filters: EntityFilters) -> EntityFilterAst {
    EntityFilterAst::new_from_filters(filters)
        .unwrap()
        .expect("filters are non-empty")
}

fn document(id: Uuid, project_id: Option<Uuid>, sub_type: Option<SoupDocumentSubType>) -> Value {
    serde_json::to_value(SoupItem::Document(SoupDocument {
        id,
        document_version_id: 1,
        owner_id: user_id(USER),
        name: "doc".into(),
        file_type: Some("pdf".into()),
        sha: None,
        project_id,
        branched_from_id: None,
        branched_from_version_id: None,
        document_family_id: None,
        created_at: ts("2026-01-02T00:00:00Z"),
        updated_at: ts("2026-01-03T00:00:00Z"),
        viewed_at: None,
        sub_type,
        deleted_at: None,
        properties: vec![],
    }))
    .unwrap()
}

#[test]
fn truth_is_kleene() {
    use Truth::*;
    assert_eq!(Match.and(Unknown), Unknown);
    assert_eq!(NoMatch.and(Unknown), NoMatch);
    assert_eq!(Match.or(Unknown), Match);
    assert_eq!(NoMatch.or(Unknown), Unknown);
    assert_eq!(!Unknown, Unknown);
    assert_eq!(!Match, NoMatch);
}

#[test]
fn empty_ast_matches_everything() {
    let item = document(Uuid::new_v4(), None, None);
    assert_eq!(eval(&EntityFilterAst::default(), &item), Truth::Match);
}

#[test]
fn document_id_filter_decides() {
    let id = Uuid::new_v4();
    let ast = ast_from(EntityFilters {
        document_filters: item_filters::DocumentFilters {
            document_ids: vec![id.to_string()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&ast, &document(id, None, None)), Truth::Match);
    assert_eq!(
        eval(&ast, &document(Uuid::new_v4(), None, None)),
        Truth::NoMatch
    );
}

#[test]
fn document_owner_file_type_and_dates_decide() {
    let id = Uuid::new_v4();
    let item = document(id, None, None);
    let ast = ast_from(EntityFilters {
        document_filters: item_filters::DocumentFilters {
            owners: vec![USER.into()],
            file_types: vec!["pdf".into()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&ast, &item), Truth::Match);

    let wrong_owner = ast_from(EntityFilters {
        document_filters: item_filters::DocumentFilters {
            owners: vec![OTHER_USER.into()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&wrong_owner, &item), Truth::NoMatch);
}

#[test]
fn document_project_filter_decides_and_null_is_unknown() {
    let project = Uuid::new_v4();
    let ast = ast_from(EntityFilters {
        document_filters: item_filters::DocumentFilters {
            project_ids: vec![project.to_string()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(
        eval(&ast, &document(Uuid::new_v4(), Some(project), None)),
        Truth::Match
    );
    assert_eq!(
        eval(&ast, &document(Uuid::new_v4(), Some(Uuid::new_v4()), None)),
        Truth::NoMatch
    );
    // No projectId on the payload mirrors SQL NULL comparison: undecidable.
    assert_eq!(
        eval(&ast, &document(Uuid::new_v4(), None, None)),
        Truth::Unknown
    );
}

#[test]
fn document_sub_type_absence_is_definite_no_match() {
    let ast = ast_from(EntityFilters {
        document_filters: item_filters::DocumentFilters {
            sub_types: vec!["task".into()],
            ..Default::default()
        },
        ..Default::default()
    });
    let task = document(
        Uuid::new_v4(),
        None,
        Some(SoupDocumentSubType::Task {
            is_completed: false,
        }),
    );
    assert_eq!(eval(&ast, &task), Truth::Match);
    // SQL has an IS NOT NULL guard, so a plain document is a definite miss.
    assert_eq!(
        eval(&ast, &document(Uuid::new_v4(), None, None)),
        Truth::NoMatch
    );
}

#[test]
fn notification_filters_are_unknown() {
    let ast = ast_from(EntityFilters {
        document_filters: item_filters::DocumentFilters {
            notification_filters: item_filters::NotificationFilters {
                done: Some(true),
                seen: None,
            },
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(
        eval(&ast, &document(Uuid::new_v4(), None, None)),
        Truth::Unknown
    );
}

#[test]
fn unknown_combines_with_decidable_filters() {
    let id = Uuid::new_v4();
    // done=Some(true) AND document_ids=[other] — the id mismatch decides
    // NoMatch even though notification state is unknown.
    let ast = ast_from(EntityFilters {
        document_filters: item_filters::DocumentFilters {
            document_ids: vec![Uuid::new_v4().to_string()],
            notification_filters: item_filters::NotificationFilters {
                done: Some(true),
                seen: None,
            },
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&ast, &document(id, None, None)), Truth::NoMatch);
}

#[test]
fn cbm_atm_nc_uses_decidable_conjuncts() {
    let ast = ast_from(EntityFilters {
        document_filters: item_filters::DocumentFilters {
            task_filters: item_filters::TaskFilters {
                include_cbm_atm_nc: Some(true),
            },
            ..Default::default()
        },
        ..Default::default()
    });
    let opts = EvalOptions {
        current_user_id: Some(USER.into()),
    };
    // Plain documents can never satisfy the task-only branch.
    let plain = document(Uuid::new_v4(), None, None);
    assert_eq!(eval_soup_item(&ast, &plain, &opts).unwrap(), Truth::NoMatch);
    // A completed task is excluded by the NOT-completed conjunct.
    let done_task = document(
        Uuid::new_v4(),
        None,
        Some(SoupDocumentSubType::Task { is_completed: true }),
    );
    assert_eq!(
        eval_soup_item(&ast, &done_task, &opts).unwrap(),
        Truth::NoMatch
    );
    // An open task owned by the user still needs the (locally unavailable)
    // assignee check.
    let open_task = document(
        Uuid::new_v4(),
        None,
        Some(SoupDocumentSubType::Task {
            is_completed: false,
        }),
    );
    assert_eq!(
        eval_soup_item(&ast, &open_task, &opts).unwrap(),
        Truth::Unknown
    );
}

#[test]
fn chat_filters_decide() {
    let id = Uuid::new_v4();
    let item = serde_json::to_value(SoupItem::Chat(SoupChat {
        id,
        name: "chat".into(),
        owner_id: user_id(USER),
        project_id: None,
        is_persistent: true,
        created_at: ts("2026-01-01T00:00:00Z"),
        updated_at: ts("2026-01-01T00:00:00Z"),
        viewed_at: None,
        deleted_at: None,
        properties: vec![],
    }))
    .unwrap();
    let ast = ast_from(EntityFilters {
        chat_filters: item_filters::ChatFilters {
            chat_ids: vec![id.to_string()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&ast, &item), Truth::Match);
    // Importance(false) short-circuits to nothing for chats.
    let unimportant = ast_from(EntityFilters {
        chat_filters: item_filters::ChatFilters {
            importance: Some(false),
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&unimportant, &item), Truth::NoMatch);
}

#[test]
fn project_children_vs_self() {
    let parent = Uuid::new_v4();
    let child_id = Uuid::new_v4();
    let item = serde_json::to_value(SoupItem::Project(SoupProject {
        id: child_id,
        name: "p".into(),
        owner_id: user_id(USER),
        parent_id: Some(parent),
        created_at: ts("2026-01-01T00:00:00Z"),
        updated_at: ts("2026-01-01T00:00:00Z"),
        viewed_at: None,
        deleted_at: None,
        properties: vec![],
    }))
    .unwrap();
    // Children-only: matches via parentId.
    let children = ast_from(EntityFilters {
        project_filters: item_filters::ProjectFilters {
            project_ids: vec![parent.to_string()],
            include_root: false,
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&children, &item), Truth::Match);
    // include_root also matches the parent project itself.
    let with_root = ast_from(EntityFilters {
        project_filters: item_filters::ProjectFilters {
            project_ids: vec![child_id.to_string()],
            include_root: true,
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&with_root, &item), Truth::Match);
}

fn email_thread(id: Uuid, link_id: Uuid, important: bool) -> Value {
    serde_json::to_value(SoupItem::EmailThread(SoupEnrichedEmailThreadPreview {
        thread: SoupEmailThreadPreview {
            id,
            provider_id: None,
            owner_id: user_id(USER),
            inbox_visible: true,
            is_read: false,
            is_draft: false,
            is_important: important,
            name: Some("subject".into()),
            snippet: None,
            sender_email: Some("alice@acme.com".into()),
            sender_name: Some("Alice".into()),
            sender_photo_url: None,
            sort_ts: ts("2026-01-05T00:00:00Z"),
            created_at: ts("2026-01-04T00:00:00Z"),
            updated_at: ts("2026-01-05T00:00:00Z"),
            viewed_at: None,
            project_id: None,
        },
        attachments: vec![SoupAttachment {
            id: Uuid::new_v4(),
            message_id: Uuid::new_v4(),
            provider_attachment_id: None,
            filename: Some("invite.ICS".into()),
            mime_type: None,
            size_bytes: None,
            content_id: None,
            created_at: ts("2026-01-04T00:00:00Z"),
        }],
        participants: vec![SoupContact {
            id: Uuid::new_v4(),
            link_id,
            name: Some("Alice".into()),
            email_address: Some("alice@acme.com".into()),
            sfs_photo_url: None,
        }],
        labels: vec![],
        properties: vec![],
    }))
    .unwrap()
}

#[test]
fn email_thread_id_owner_and_importance_decide() {
    let id = Uuid::new_v4();
    let link = Uuid::new_v4();
    let item = email_thread(id, link, true);

    let by_thread = ast_from(EntityFilters {
        email_filters: item_filters::EmailFilters {
            email_thread_ids: vec![id.to_string()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&by_thread, &item), Truth::Match);

    let by_inbox = ast_from(EntityFilters {
        email_filters: item_filters::EmailFilters {
            link_ids: vec![link.to_string()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&by_inbox, &item), Truth::Match);
    let other_inbox = ast_from(EntityFilters {
        email_filters: item_filters::EmailFilters {
            link_ids: vec![Uuid::new_v4().to_string()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&other_inbox, &item), Truth::NoMatch);

    let important = ast_from(EntityFilters {
        email_filters: item_filters::EmailFilters {
            importance: Some(false),
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&important, &item), Truth::NoMatch);
}

#[test]
fn email_sender_positive_match_and_calendar_only() {
    let item = email_thread(Uuid::new_v4(), Uuid::new_v4(), false);
    let by_sender = ast_from(EntityFilters {
        email_filters: item_filters::EmailFilters {
            senders: vec!["alice@acme.com".into()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&by_sender, &item), Truth::Match);
    // A different sender cannot be ruled out from the preview alone.
    let other_sender = ast_from(EntityFilters {
        email_filters: item_filters::EmailFilters {
            senders: vec!["bob@acme.com".into()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&other_sender, &item), Truth::Unknown);

    let calendar = ast_from(EntityFilters {
        email_filters: item_filters::EmailFilters {
            calendar_only: Some(true),
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&calendar, &item), Truth::Match);
}

fn channel(id: Uuid, channel_type: ChannelType) -> Value {
    serde_json::to_value(SoupItem::Channel(SoupChannel {
        channel: ChannelWithParticipants {
            channel: Channel {
                id: models_comms::channel::ChannelId(id),
                name: Some("general".into()),
                channel_type,
                org_id: Some(models_comms::channel::OrganizationId(42)),
                team_id: None,
                created_at: ts("2026-01-01T00:00:00Z"),
                updated_at: ts("2026-01-02T00:00:00Z"),
                owner_id: user_id(USER),
            },
            participants: vec![],
        },
        latest_message: LatestMessage {
            latest_message: None,
            latest_non_thread_message: None,
        },
        viewed_at: None,
        interacted_at: None,
    }))
    .unwrap()
}

#[test]
fn channel_filters_decide_on_nested_snake_case_payload() {
    let id = Uuid::new_v4();
    let item = channel(id, ChannelType::Public);
    let by_id = ast_from(EntityFilters {
        channel_filters: item_filters::ChannelFilters {
            channel_ids: vec![id.to_string()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&by_id, &item), Truth::Match);

    let by_type = ast_from(EntityFilters {
        channel_filters: item_filters::ChannelFilters {
            channel_types: vec!["direct_message".into()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&by_type, &item), Truth::NoMatch);

    let by_org = ast_from(EntityFilters {
        channel_filters: item_filters::ChannelFilters {
            org_id: Some(42),
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&by_org, &item), Truth::Match);
}

fn call(id: Uuid, status: CallStatus) -> Value {
    serde_json::to_value(SoupItem::Call(models_soup::call_record::SoupCallRecord {
        call_id: id,
        channel_id: Uuid::new_v4(),
        created_by: USER.into(),
        started_at: ts("2026-01-01T00:00:00Z"),
        ended_at: None,
        duration_ms: None,
        channel_name: None,
        custom_name: None,
        summary: None,
        is_active: true,
        status,
        attended: status == CallStatus::Attended,
        participants: vec![],
    }))
    .unwrap()
}

#[test]
fn call_status_and_attended_decide() {
    let id = Uuid::new_v4();
    let item = call(id, CallStatus::Attended);
    let ast = ast_from(EntityFilters {
        call_filters: item_filters::CallFilters {
            call_ids: vec![id.to_string()],
            status: Some(CallStatus::Attended),
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&ast, &item), Truth::Match);
    let missed = ast_from(EntityFilters {
        call_filters: item_filters::CallFilters {
            status: Some(CallStatus::Missed),
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&missed, &item), Truth::NoMatch);
}

#[test]
fn crm_company_and_foreign_entity_decide() {
    let company_id = Uuid::new_v4();
    let company = serde_json::to_value(SoupItem::CrmCompany(SoupCrmCompany {
        id: company_id,
        team_id: Uuid::new_v4(),
        name: Some("Acme".into()),
        description: None,
        email_sync: true,
        hidden: false,
        created_at: ts("2026-01-01T00:00:00Z"),
        updated_at: ts("2026-01-01T00:00:00Z"),
        viewed_at: None,
        domains: vec![],
    }))
    .unwrap();
    let hidden_only = ast_from(EntityFilters {
        crm_company_filters: item_filters::CrmCompanyFilters {
            company_ids: vec![company_id.to_string()],
            hidden: Some(true),
        },
        ..Default::default()
    });
    assert_eq!(eval(&hidden_only, &company), Truth::NoMatch);

    let fe = serde_json::to_value(SoupItem::ForeignEntity(SoupForeignEntity {
        id: Uuid::new_v4(),
        foreign_entity_id: "PR-123".into(),
        foreign_entity_source: "github".into(),
        metadata: json!({}),
        stored_for_id: "x".into(),
        stored_for_auth_entity: "user".into(),
        created_at: ts("2026-01-01T00:00:00Z"),
        updated_at: ts("2026-01-01T00:00:00Z"),
    }))
    .unwrap();
    let by_source = ast_from(EntityFilters {
        foreign_entity_filters: item_filters::ForeignEntityFilters {
            foreign_entity_sources: vec!["github".into()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&by_source, &fe), Truth::Match);
}

#[test]
fn property_filters_match_select_options_and_entity_refs() {
    let definition_id = Uuid::new_v4();
    let option = Uuid::new_v4();
    let definition = PropertyDefinition {
        id: definition_id,
        owner: PropertyOwner::System,
        display_name: "Status".into(),
        data_type: DataType::SelectString,
        is_multi_select: false,
        specific_entity_type: Some(EntityType::Task),
        created_at: ts("2026-01-01T00:00:00Z"),
        updated_at: ts("2026-01-01T00:00:00Z"),
        is_system: true,
        is_metadata: false,
    };
    let mut item = serde_json::to_value(SoupItem::Document(SoupDocument {
        id: Uuid::new_v4(),
        document_version_id: 1,
        owner_id: user_id(USER),
        name: "task".into(),
        file_type: None,
        sha: None,
        project_id: None,
        branched_from_id: None,
        branched_from_version_id: None,
        document_family_id: None,
        created_at: ts("2026-01-01T00:00:00Z"),
        updated_at: ts("2026-01-01T00:00:00Z"),
        viewed_at: None,
        sub_type: Some(SoupDocumentSubType::Task {
            is_completed: false,
        }),
        deleted_at: None,
        properties: vec![
            SoupProperty {
                definition: definition.clone(),
                value: Some(PropertyValue::SelectOption(vec![option])),
            },
            SoupProperty {
                definition: PropertyDefinition {
                    id: Uuid::new_v4(),
                    data_type: DataType::Entity,
                    display_name: "Assignee".into(),
                    ..definition.clone()
                },
                value: Some(PropertyValue::EntityRef(vec![EntityReference::new(
                    USER,
                    EntityType::User,
                )])),
            },
        ],
    }))
    .unwrap();

    let matching = ast_from(EntityFilters {
        property_filters: vec![item_filters::PropertyFilter {
            property_definition_id: definition_id.to_string(),
            entity_type: Some("TASK".into()),
            option_ids: vec![option.to_string()],
            entity_ids: vec![],
        }],
        ..Default::default()
    });
    assert_eq!(eval(&matching, &item), Truth::Match);

    let wrong_option = ast_from(EntityFilters {
        property_filters: vec![item_filters::PropertyFilter {
            property_definition_id: definition_id.to_string(),
            entity_type: None,
            option_ids: vec![Uuid::new_v4().to_string()],
            entity_ids: vec![],
        }],
        ..Default::default()
    });
    assert_eq!(eval(&wrong_option, &item), Truth::NoMatch);

    // The entity-type clause uses the item's derived type (TASK for task
    // documents), so a DOCUMENT-constrained literal misses a task.
    let wrong_type = ast_from(EntityFilters {
        property_filters: vec![item_filters::PropertyFilter {
            property_definition_id: definition_id.to_string(),
            entity_type: Some("DOCUMENT".into()),
            option_ids: vec![option.to_string()],
            entity_ids: vec![],
        }],
        ..Default::default()
    });
    assert_eq!(eval(&wrong_type, &item), Truth::NoMatch);

    // Properties never apply to channels and the like.
    let chan = channel(Uuid::new_v4(), ChannelType::Public);
    assert_eq!(eval(&matching, &chan), Truth::NoMatch);

    // A payload without a properties list cannot decide.
    item.get_mut("data")
        .unwrap()
        .as_object_mut()
        .unwrap()
        .remove("properties");
    assert_eq!(eval(&matching, &item), Truth::Unknown);
}

#[test]
fn frontend_built_ast_wire_shape_parses_and_evaluates() {
    // The exact wire shape compile.ts produces: `&`/`|`/`!` combinators and
    // `l` literal nodes with short field tags.
    let id = Uuid::new_v4();
    let other = Uuid::new_v4();
    let ast: EntityFilterAst = serde_json::from_value(json!({
        "df": {
            "|": [
                { "l": { "id": id.to_string() } },
                { "l": { "id": other.to_string() } }
            ]
        },
        "cf": { "!": { "l": { "cid": Uuid::new_v4().to_string() } } }
    }))
    .unwrap();
    assert_eq!(eval(&ast, &document(id, None, None)), Truth::Match);
    assert_eq!(
        eval(&ast, &document(Uuid::new_v4(), None, None)),
        Truth::NoMatch
    );
}

#[test]
fn nil_uuid_exclusion_pattern_excludes_entity_type() {
    // QUERY_FILTERS_BASE on the frontend excludes entity types by filtering
    // on the nil uuid.
    let ast = ast_from(EntityFilters {
        document_filters: item_filters::DocumentFilters {
            document_ids: vec![Uuid::nil().to_string()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(
        eval(&ast, &document(Uuid::new_v4(), None, None)),
        Truth::NoMatch
    );
    // Other entity types have no filter tree and pass through.
    let chat_item = serde_json::to_value(SoupItem::Chat(SoupChat {
        id: Uuid::new_v4(),
        name: "c".into(),
        owner_id: user_id(USER),
        project_id: None,
        is_persistent: true,
        created_at: ts("2026-01-01T00:00:00Z"),
        updated_at: ts("2026-01-01T00:00:00Z"),
        viewed_at: None,
        deleted_at: None,
        properties: vec![],
    }))
    .unwrap();
    assert_eq!(eval(&ast, &chat_item), Truth::Match);
}

#[test]
fn typed_filters_entry_point_round_trips() {
    let id = Uuid::new_v4();
    let filters = EntityFilters {
        document_filters: item_filters::DocumentFilters {
            document_ids: vec![id.to_string()],
            ..Default::default()
        },
        ..Default::default()
    };
    let verdict = eval_entity_filters(filters, &document(id, None, None), &EvalOptions::default())
        .unwrap()
        .unwrap();
    assert_eq!(verdict, Truth::Match);
}

#[test]
fn unknown_tags_degrade_gracefully_and_malformed_items_error() {
    let ast = EntityFilterAst::default();
    let future_item = json!({ "tag": "hologram", "data": {} });
    assert_eq!(
        eval_soup_item(&ast, &future_item, &EvalOptions::default()).unwrap(),
        Truth::Unknown
    );
    let malformed = json!({ "data": {} });
    assert!(eval_soup_item(&ast, &malformed, &EvalOptions::default()).is_err());
}

#[test]
fn frecency_wrapper_fields_are_ignored() {
    // SoupApiItem adds frecency_score next to tag/data; the evaluator must
    // tolerate it.
    let id = Uuid::new_v4();
    let mut item = document(id, None, None);
    item.as_object_mut()
        .unwrap()
        .insert("frecency_score".into(), json!(0.42));
    let ast = ast_from(EntityFilters {
        document_filters: item_filters::DocumentFilters {
            document_ids: vec![id.to_string()],
            ..Default::default()
        },
        ..Default::default()
    });
    assert_eq!(eval(&ast, &item), Truth::Match);
}

#[test]
fn dates_compare_with_sql_operators() {
    let item = document(Uuid::new_v4(), None, None); // createdAt = 2026-01-02
    let created_after = |bound: &str| {
        serde_json::from_value::<EntityFilterAst>(json!({
            "df": { "l": { "ca": { "gt": bound } } }
        }))
        .unwrap()
    };
    assert_eq!(
        eval(&created_after("2026-01-01T00:00:00Z"), &item),
        Truth::Match
    );
    assert_eq!(
        eval(&created_after("2026-01-02T00:00:00Z"), &item),
        Truth::NoMatch
    );
    assert_eq!(
        eval(
            &Utc.with_ymd_and_hms(2026, 1, 2, 0, 0, 0)
                .single()
                .map(|bound| serde_json::from_value::<EntityFilterAst>(json!({
                    "df": { "l": { "ca": { "gte": bound.to_rfc3339() } } }
                }))
                .unwrap())
                .unwrap(),
            &item
        ),
        Truth::Match
    );
}
