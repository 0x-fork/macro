//! Property literal evaluation, mirroring `build_properties_filter` in
//! `soup/src/outbound/pg_soup_repo/expanded/dynamic.rs`.
//!
//! The SQL is an `EXISTS` probe against `entity_properties` for the row's
//! entity id (and entity type, when the literal constrains one). The soup
//! payload carries the entity's loaded properties (`data.properties`), so the
//! probe translates to scanning that list.

use item_filters::ast::properties::{PropertiesLiteral, PropertyEntityType, PropertyMatchValue};
use serde_json::Value;

use crate::item::{array_field, object_field, str_field};
use crate::{Data, Truth};

/// Derive the `entity_properties.entity_type` a row for this item would
/// carry, following `SoupItem::to_entity_reference`: task documents are
/// `TASK`, plain documents `DOCUMENT`; channels, calls, CRM companies and
/// foreign entities have no property rows.
fn derived_entity_type(tag: &str, data: &Data) -> Option<PropertyEntityType> {
    match tag {
        "document" => {
            let is_task = object_field(data, "subType")
                .and_then(|st| str_field(st, "type"))
                .is_some_and(|t| t == "task");
            Some(if is_task {
                PropertyEntityType::Task
            } else {
                PropertyEntityType::Document
            })
        }
        "project" => Some(PropertyEntityType::Project),
        "chat" => Some(PropertyEntityType::Chat),
        "emailThread" => Some(PropertyEntityType::Thread),
        _ => None,
    }
}

/// Does the item carry a property with `definition.id == definition_id`
/// whose `EntityReference` value contains `entity_id`?
///
/// Mirrors the SQL `values->'value' @> [{"entity_id": ...}]` probe used by
/// both the properties literal and the document task predicates
/// (`ep_assignees` join). [`Truth::Unknown`] when the payload has no
/// properties list at all; a present-but-non-matching list is a definite
/// [`Truth::NoMatch`] (matching the SQL's null handling for the missing-row
/// case).
pub(crate) fn entity_ref_property_contains(
    data: &Data,
    definition_id: &uuid::Uuid,
    entity_id: &str,
) -> Truth {
    let Some(properties) = array_field(data, "properties") else {
        return Truth::Unknown;
    };
    properties
        .iter()
        .filter_map(Value::as_object)
        .any(|property| {
            let definition_matches = object_field(property, "definition")
                .and_then(|d| str_field(d, "id"))
                .and_then(|id| uuid::Uuid::parse_str(id).ok())
                .is_some_and(|id| id == *definition_id);
            definition_matches
                && object_field(property, "value").is_some_and(|value| {
                    str_field(value, "type") == Some("EntityReference")
                        && array_field(value, "value").is_some_and(|refs| {
                            refs.iter()
                                .filter_map(Value::as_object)
                                .any(|r| str_field(r, "entity_id") == Some(entity_id))
                        })
                })
        })
        .into()
}

/// Does one `SoupProperty` JSON entry satisfy the literal's value predicate?
fn property_matches(property: &Value, literal: &PropertiesLiteral) -> bool {
    let Some(property) = property.as_object() else {
        return false;
    };
    let definition_matches = object_field(property, "definition")
        .and_then(|d| str_field(d, "id"))
        .and_then(|id| uuid::Uuid::parse_str(id).ok())
        .is_some_and(|id| id == literal.property_definition_id);
    if !definition_matches {
        return false;
    }
    let Some(value) = object_field(property, "value") else {
        return false;
    };
    match &literal.value {
        // SQL: values->'value' ? '{option_id}' over
        // {"type": "SelectOption", "value": ["uuid", ...]}.
        PropertyMatchValue::SelectOption(option_id) => {
            str_field(value, "type") == Some("SelectOption")
                && array_field(value, "value").is_some_and(|options| {
                    options
                        .iter()
                        .filter_map(Value::as_str)
                        .filter_map(|s| uuid::Uuid::parse_str(s).ok())
                        .any(|id| id == *option_id)
                })
        }
        // SQL: values->'value' @> [{"entity_id": "{id}"}] over
        // {"type": "EntityReference", "value": [{"entity_id": ...}, ...]}.
        PropertyMatchValue::EntityRef(entity_id) => {
            let expected = entity_id.to_string();
            str_field(value, "type") == Some("EntityReference")
                && array_field(value, "value").is_some_and(|refs| {
                    refs.iter()
                        .filter_map(Value::as_object)
                        .any(|r| str_field(r, "entity_id") == Some(expected.as_str()))
                })
        }
    }
}

pub(crate) fn eval(literal: &PropertiesLiteral, tag: &str, data: &Data) -> Truth {
    let Some(derived) = derived_entity_type(tag, data) else {
        // Entity types without property rows can never satisfy the EXISTS.
        return Truth::NoMatch;
    };
    if let Some(required) = literal.entity_type
        && required != derived
    {
        return Truth::NoMatch;
    }
    // The payload's properties list is the entity's loaded properties; when
    // it is absent entirely the payload predates property loading and the
    // probe is undecidable.
    let Some(properties) = array_field(data, "properties") else {
        return Truth::Unknown;
    };
    properties
        .iter()
        .any(|p| property_matches(p, literal))
        .into()
}
