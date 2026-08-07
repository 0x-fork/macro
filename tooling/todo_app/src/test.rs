use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

use crate::{
    router,
    store::{MemoryTodoStore, NewTodo, Todo, TodoStore},
};

fn test_app() -> axum::Router {
    router(MemoryTodoStore::default())
}

async fn body_json(response: axum::response::Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn list_starts_empty() {
    let response = test_app()
        .oneshot(
            Request::builder()
                .uri("/api/todos")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body_json(response).await, json!([]));
}

#[tokio::test]
async fn create_and_list_todo() {
    let app = test_app();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/todos")
                .header("content-type", "application/json")
                .body(Body::from(json!({ "text": "buy milk" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    let created = body_json(response).await;
    assert_eq!(created["text"], "buy milk");
    assert_eq!(created["completed"], false);

    let id = created["id"].as_str().unwrap();
    let response = app
        .oneshot(Request::builder().uri("/api/todos").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let todos = body_json(response).await;
    assert_eq!(todos.as_array().unwrap().len(), 1);
    assert_eq!(todos[0]["id"], id);
}

#[tokio::test]
async fn toggle_todo_flips_completed() {
    let store = MemoryTodoStore::default();
    let todo = store.insert(Todo::new("write tests".into()));
    let app = router(store);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/todos/{}", todo.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let toggled = body_json(response).await;
    assert_eq!(toggled["id"], todo.id.to_string());
    assert_eq!(toggled["completed"], true);

    let response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/todos/{}", todo.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let toggled = body_json(response).await;
    assert_eq!(toggled["completed"], false);
}

#[tokio::test]
async fn toggle_missing_todo_returns_not_found() {
    let response = test_app()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/todos/00000000-0000-0000-0000-000000000000")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn delete_todo_removes_it() {
    let store = MemoryTodoStore::default();
    let todo = store.insert(Todo::new("clean up".into()));
    let app = router(store);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/todos/{}", todo.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    let response = app
        .oneshot(Request::builder().uri("/api/todos").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(body_json(response).await, json!([]));
}

#[tokio::test]
async fn delete_missing_todo_returns_not_found() {
    let response = test_app()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/todos/00000000-0000-0000-0000-000000000000")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn ui_is_served_at_root() {
    let response = test_app()
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let html = String::from_utf8(bytes.to_vec()).unwrap();
    assert!(html.contains("My Todo"));
}

#[test]
fn new_todo_starts_incomplete() {
    let todo = Todo::new("purple theme".into());
    assert_eq!(todo.completed, false);
    assert!(todo.id != uuid::Uuid::nil());
}

#[test]
fn store_toggle_returns_some_for_known_id() {
    let store = MemoryTodoStore::default();
    let todo = store.insert(Todo::new("present".into()));

    let toggled = store.toggle(todo.id).unwrap();
    assert!(toggled.completed);

    assert!(store.toggle(uuid::Uuid::nil()).is_none());
}

#[test]
fn new_todo_serde_round_trip() {
    let new = NewTodo {
        text: "hello".into(),
    };
    let json = serde_json::to_string(&new).unwrap();
    let back: NewTodo = serde_json::from_str(&json).unwrap();
    assert_eq!(back.text, "hello");
}
