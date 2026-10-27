use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
    routing::get,
};
use macro_authorization::{BOT_SCOPE_HEADER, BOT_TOKEN_HEADER, BotScope, INTERNAL_API_KEY_HEADER};
use tower::ServiceExt;

use super::*;
use crate::{
    domain::models::{OwnerAccessLevel, ViewAccessLevel},
    inbound::axum_extractors::test_support::{
        AccessCall, FakeAuthorizationService, FakeEntityAccessService, INTERNAL_KEY, TestState,
        USER_ID, VALID_BOT_TOKEN,
    },
};

const GROUP_ID: &str = "0199b1f2-6b3a-7f1a-9c2a-2f0d5c2a8f12";

type ViewExtractor = WhatsAppGroupAccessLevelExtractor<
    ViewAccessLevel,
    FakeEntityAccessService,
    FakeAuthorizationService,
>;
type OwnerExtractor = WhatsAppGroupAccessLevelExtractor<
    OwnerAccessLevel,
    FakeEntityAccessService,
    FakeAuthorizationService,
>;

fn describe<Permission: RequiredPermission>(receipt: &EntityAccessReceipt<Permission>) -> String {
    let auth = match receipt.auth() {
        EntityAccessAuth::Authenticated(user_id) => user_id.as_ref().to_string(),
        EntityAccessAuth::Unauthenticated => "unauthenticated".to_string(),
        EntityAccessAuth::Internal => "internal".to_string(),
        EntityAccessAuth::Bot(_) => "bot".to_string(),
    };
    let level = match receipt.entity_permission() {
        EntityPermission::AccessLevel { access_level } => access_level.to_string(),
        other => format!("{other:?}"),
    };
    format!("{}:{auth}:{level}", receipt.entity().entity_type)
}

async fn view_handler(extracted: ViewExtractor) -> String {
    describe(&extracted.entity_access_receipt)
}

async fn owner_handler(extracted: OwnerExtractor) -> String {
    describe(&extracted.entity_access_receipt)
}

fn router(state: TestState) -> Router {
    Router::new()
        .route("/whatsapp-groups/{group_id}", get(view_handler))
        .route(
            "/whatsapp-groups/{group_id}/permissions",
            get(owner_handler),
        )
        .route("/whatsapp-groups", get(view_handler))
        .with_state(state)
}

fn request(path: &str, token: Option<&str>) -> Request<Body> {
    let mut request = Request::get(path);
    if let Some(token) = token {
        request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    request
        .body(Body::empty())
        .expect("request should be valid")
}

async fn response_body(response: axum::response::Response) -> String {
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("response body should be readable");
    String::from_utf8(body.to_vec()).expect("response body should be UTF-8")
}

#[tokio::test]
async fn a_signed_in_viewer_gets_a_receipt_at_their_level() {
    let state = TestState::new(Some(AccessLevel::View));
    let response = router(state.clone())
        .oneshot(request(
            &format!("/whatsapp-groups/{GROUP_ID}"),
            Some("valid"),
        ))
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response_body(response).await,
        format!("whatsapp_group:{USER_ID}:view")
    );
    assert_eq!(
        state.entity_access.calls(),
        [AccessCall {
            user_id: Some(USER_ID.to_string()),
            entity_id: GROUP_ID.to_string(),
            entity_type: EntityType::WhatsAppGroup,
        }]
    );
}

#[tokio::test]
async fn a_viewer_does_not_meet_owner() {
    let state = TestState::new(Some(AccessLevel::View));
    let response = router(state)
        .oneshot(request(
            &format!("/whatsapp-groups/{GROUP_ID}/permissions"),
            Some("valid"),
        ))
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn the_owner_meets_owner() {
    let state = TestState::new(Some(AccessLevel::Owner));
    let response = router(state)
        .oneshot(request(
            &format!("/whatsapp-groups/{GROUP_ID}/permissions"),
            Some("valid"),
        ))
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response_body(response).await,
        format!("whatsapp_group:{USER_ID}:owner")
    );
}

#[tokio::test]
async fn a_signed_in_stranger_is_rejected() {
    let state = TestState::new(None);
    let response = router(state)
        .oneshot(request(
            &format!("/whatsapp-groups/{GROUP_ID}"),
            Some("valid"),
        ))
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn an_anonymous_request_is_rejected_without_a_lookup() {
    let state = TestState::new(Some(AccessLevel::View));
    let response = router(state.clone())
        .oneshot(request(&format!("/whatsapp-groups/{GROUP_ID}"), None))
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert!(state.entity_access.calls().is_empty());
}

#[tokio::test]
async fn an_expired_token_is_rejected() {
    let state = TestState::new(Some(AccessLevel::View));
    let response = router(state.clone())
        .oneshot(request(
            &format!("/whatsapp-groups/{GROUP_ID}"),
            Some("expired"),
        ))
        .await
        .expect("router should respond");

    assert_ne!(response.status(), StatusCode::OK);
    assert!(state.entity_access.calls().is_empty());
}

#[tokio::test]
async fn a_bot_gets_a_bot_receipt() {
    let state = TestState::new(Some(AccessLevel::View));
    let response = router(state.clone())
        .oneshot(
            Request::get(format!("/whatsapp-groups/{GROUP_ID}"))
                .header(BOT_TOKEN_HEADER, VALID_BOT_TOKEN)
                .header(BOT_SCOPE_HEADER, BotScope::User.as_str())
                .body(Body::empty())
                .expect("request should be valid"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response_body(response).await, "whatsapp_group:bot:view");
    assert_eq!(state.entity_access.bot_calls().len(), 1);
}

#[tokio::test]
async fn a_bot_without_access_is_rejected() {
    let state = TestState::new(None);
    let response = router(state)
        .oneshot(
            Request::get(format!("/whatsapp-groups/{GROUP_ID}"))
                .header(BOT_TOKEN_HEADER, VALID_BOT_TOKEN)
                .header(BOT_SCOPE_HEADER, BotScope::User.as_str())
                .body(Body::empty())
                .expect("request should be valid"),
        )
        .await
        .expect("router should respond");

    assert_ne!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn an_internal_caller_without_a_user_is_trusted_as_owner() {
    let state = TestState::new(None);
    let response = router(state.clone())
        .oneshot(
            Request::get(format!("/whatsapp-groups/{GROUP_ID}/permissions"))
                .header(INTERNAL_API_KEY_HEADER, INTERNAL_KEY)
                .body(Body::empty())
                .expect("request should be valid"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response_body(response).await,
        "whatsapp_group:internal:owner"
    );
    assert!(state.entity_access.calls().is_empty());
}

#[tokio::test]
async fn a_missing_group_id_is_a_bad_request() {
    let state = TestState::new(Some(AccessLevel::Owner));
    let response = router(state.clone())
        .oneshot(request("/whatsapp-groups", Some("valid")))
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(state.entity_access.calls().is_empty());
}
