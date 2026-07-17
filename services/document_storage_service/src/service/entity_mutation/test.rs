use super::*;

#[test]
fn legacy_success_includes_requested_entity_and_cascade_refs() {
    let requested = EntityRef::new(EntityType::Project, "project-1");
    let child = EntityRef::new(EntityType::Document, "document-1");

    let outcome = legacy_outcome(requested.clone(), Ok(vec![child.clone()]));

    assert_eq!(outcome.entity, Some(requested.clone()));
    assert_eq!(outcome.affected_entities, vec![requested, child]);
    assert!(outcome.error.is_none());
}

#[test]
fn legacy_invalid_inputs_map_to_stable_public_error() {
    let requested = EntityRef::new(EntityType::Project, "project-1");

    let outcome = legacy_outcome(
        requested,
        Err(LegacyEntityMutationError::InvalidInput(
            "invalid project state".to_owned(),
        )),
    );

    let error = outcome.error.expect("invalid input must include an error");
    assert_eq!(error.code, EntityMutationErrorCode::InvalidInput);
    assert_eq!(error.message, "invalid project state");
}
