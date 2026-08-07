use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Todo {
    pub id: Uuid,
    pub text: String,
    pub completed: bool,
}

impl Todo {
    pub fn new(text: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            text,
            completed: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewTodo {
    pub text: String,
}

pub trait TodoStore: Send + Sync + 'static {
    fn list(&self) -> Vec<Todo>;
    fn insert(&self, todo: Todo) -> Todo;
    fn toggle(&self, id: Uuid) -> Option<Todo>;
    fn delete(&self, id: Uuid) -> bool;
}

#[derive(Debug, Clone, Default)]
pub struct MemoryTodoStore {
    todos: std::sync::Mutex<Vec<Todo>>,
}

impl TodoStore for MemoryTodoStore {
    fn list(&self) -> Vec<Todo> {
        self.todos.lock().unwrap().clone()
    }

    fn insert(&self, todo: Todo) -> Todo {
        self.todos.lock().unwrap().push(todo.clone());
        todo
    }

    fn toggle(&self, id: Uuid) -> Option<Todo> {
        let mut todos = self.todos.lock().unwrap();
        let todo = todos.iter_mut().find(|todo| todo.id == id)?;
        todo.completed = !todo.completed;
        Some(todo.clone())
    }

    fn delete(&self, id: Uuid) -> bool {
        let mut todos = self.todos.lock().unwrap();
        let index = todos.iter().position(|todo| todo.id == id);
        index.map(|index| todos.remove(index)).is_some()
    }
}
