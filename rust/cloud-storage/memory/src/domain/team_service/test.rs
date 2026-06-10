use super::*;

fn user_id(value: &str) -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from(value.to_string()).expect("valid macro user id")
}

fn overview() -> TeamOverview {
    TeamOverview {
        name: "Acme Engineering".to_string(),
        member_ids: vec![
            "macro|alice@acme.com".to_string(),
            "macro|bob@acme.com".to_string(),
        ],
    }
}

#[test]
fn team_generation_system_prompt_includes_team_context() {
    let user = user_id("macro|memory-test@example.com");
    let team_id = macro_uuid::generate_uuid_v7();
    let prompt = build_team_generation_system_prompt(
        "base tools prompt",
        &user,
        team_id,
        &overview(),
        "Mon, 08 Jun 2026 12:00:00 +0000",
        None,
    );

    assert!(prompt.contains("base tools prompt"));
    assert!(prompt.contains("<user_id>macro|memory-test@example.com</user_id>"));
    assert!(prompt.contains(&format!("<team_id>{team_id}</team_id>")));
    assert!(prompt.contains("<team_name>Acme Engineering</team_name>"));
    assert!(
        prompt.contains("<team_members>macro|alice@acme.com, macro|bob@acme.com</team_members>")
    );
    assert!(prompt.contains("<datetime>Mon, 08 Jun 2026 12:00:00 +0000</datetime>"));
}

#[test]
fn team_generation_system_prompt_includes_previous_memory_when_present() {
    let user = user_id("macro|memory-test@example.com");
    let prompt = build_team_generation_system_prompt(
        "base tools prompt",
        &user,
        macro_uuid::generate_uuid_v7(),
        &overview(),
        "Mon, 08 Jun 2026 12:00:00 +0000",
        Some("previous durable team facts"),
    );

    assert!(
        prompt.contains(
            "<previous_team_memory>\nprevious durable team facts\n</previous_team_memory>"
        )
    );
}

#[test]
fn team_generation_system_prompt_omits_previous_memory_when_absent() {
    let user = user_id("macro|memory-test@example.com");
    let prompt = build_team_generation_system_prompt(
        "base tools prompt",
        &user,
        macro_uuid::generate_uuid_v7(),
        &overview(),
        "Mon, 08 Jun 2026 12:00:00 +0000",
        None,
    );

    assert!(!prompt.contains("<previous_team_memory>"));
}
