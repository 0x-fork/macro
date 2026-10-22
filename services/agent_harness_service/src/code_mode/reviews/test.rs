use super::*;
use serde_json::json;

#[test]
fn review_validation_uses_existing_action_contracts() {
    let tools = ai_tools::code_mode_tools();
    let email = json!({"subject":"Review", "body":"**Markdown**", "to":[{"email":"recipient@example.com"}]});
    assert!(validate_draft(&tools, ReviewKind::Email, &email).is_ok());
    assert!(
        validate_draft(
            &tools,
            ReviewKind::Email,
            &json!({"subject":"missing body"})
        )
        .is_err()
    );
    assert!(
        validate_draft(
            &tools,
            ReviewKind::Calendar,
            &json!({"title":"missing time"})
        )
        .is_err()
    );
}
