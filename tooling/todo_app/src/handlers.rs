use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{Html, IntoResponse},
    Json,
};
use uuid::Uuid;

use crate::store::{MemoryTodoStore, NewTodo, Todo};

pub async fn ui() -> Html<&'static str> {
    Html(include_str!("../static/index.html"))
}

pub async fn list_todos(State(store): State<MemoryTodoStore>) -> Json<Vec<Todo>> {
    Json(store.list())
}

pub async fn create_todo(
    State(store): State<MemoryTodoStore>,
    Json(new): Json<NewTodo>,
) -> impl IntoResponse {
    let todo = store.insert(Todo::new(new.text));
    (StatusCode::CREATED, Json(todo))
}

pub async fn toggle_todo(
    State(store): State<MemoryTodoStore>,
    Path(id): Path<Uuid>,
) -> Result<Json<Todo>, StatusCode> {
    store.toggle(id).map(Json).ok_or(StatusCode::NOT_FOUND)
}

pub async fn delete_todo(
    State(store): State<MemoryTodoStore>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    if store.delete(id) {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}
