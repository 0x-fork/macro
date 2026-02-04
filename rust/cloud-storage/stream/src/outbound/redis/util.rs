use std::future::Future;
use tokio::task::JoinHandle;
use uuid::Uuid;

// A tokio::task wrapper that's hashabe + abort on drop
pub struct Task {
    id: Uuid,
    task: JoinHandle<()>,
}

impl Task {
    pub fn spawn<F>(task: F) -> Self
    where
        F: Future + Send + 'static,
    {
        let handle = tokio::task::spawn(async move {
            task.await;
        });

        let id = Uuid::new_v4();
        Self { task: handle, id }
    }
    pub fn kill(&self) {
        self.task.abort();
    }
}

impl std::hash::Hash for Task {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.id.hash(state)
    }
}

impl std::cmp::PartialEq for Task {
    fn eq(&self, other: &Self) -> bool {
        self.id.eq(&other.id)
    }
}

impl std::cmp::Eq for Task {}

impl Drop for Task {
    fn drop(&mut self) {
        // :)
        self.kill();
    }
}
