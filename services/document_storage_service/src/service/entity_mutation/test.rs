use super::*;

#[test]
fn lifecycle_success_includes_requested_entity_and_cascade_refs() {
    let requested = EntityRef::new(EntityType::Project, "project-1");
    let child = EntityRef::new(EntityType::Document, "document-1");

    let outcome = lifecycle_success(requested.clone(), vec![child.clone()]);

    assert_eq!(outcome.entity, Some(requested.clone()));
    assert_eq!(outcome.affected_entities, vec![requested, child]);
    assert!(outcome.error.is_none());
}

#[test]
fn lifecycle_invalid_inputs_map_to_stable_public_error() {
    let error = public_error(MutationError::Lifecycle(LifecycleError::InvalidInput(
        "invalid project state".to_owned(),
    )));

    assert_eq!(error.code, EntityMutationErrorCode::InvalidInput);
    assert_eq!(error.message, "invalid project state");
}

#[test]
fn target_project_failures_name_the_target() {
    let forbidden = public_error(MutationError::TargetProject(AccessError::Unauthorized));
    assert_eq!(forbidden.code, EntityMutationErrorCode::Forbidden);
    assert_eq!(
        forbidden.message,
        "insufficient permission for the target project"
    );

    let missing = public_error(MutationError::TargetProject(AccessError::NotFound(
        "project-1",
    )));
    assert_eq!(missing.code, EntityMutationErrorCode::NotFound);
    assert_eq!(missing.message, "target project not found");
}

#[test]
fn favoritable_kinds_are_an_explicit_allowlist() {
    for entity_type in [
        EntityType::User,
        EntityType::Team,
        EntityType::ChannelMessage,
    ] {
        assert!(
            !favoritable(entity_type),
            "{entity_type} must not be favoritable"
        );
    }
    for entity_type in [
        EntityType::Document,
        EntityType::Project,
        EntityType::Chat,
        EntityType::Channel,
        EntityType::EmailThread,
        EntityType::Call,
        EntityType::ForeignEntity,
        EntityType::StaticFile,
        EntityType::CrmCompany,
        EntityType::CrmContact,
    ] {
        assert!(
            favoritable(entity_type),
            "{entity_type} must be favoritable"
        );
    }
}
