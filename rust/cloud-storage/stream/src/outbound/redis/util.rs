use std::future::Future;
use tokio::task::JoinHandle;
use uuid::Uuid;

// A tokio::task wrapper that's hashabe + abort on drop
#[derive(Debug)]
pub struct StreamTask {
    task: JoinHandle<()>,
}

impl StreamTask {
    pub fn spawn<F, Fut>(task: F) -> (Self, Uuid)
    where
        F: FnOnce(Uuid) -> Fut,
        Fut: Future<Output = ()> + Send + 'static,
    {
        let id = Uuid::new_v4();
        let handle = tokio::task::spawn(task(id.clone()));

        (Self { task: handle }, id)
    }
    
    pub fn kill(&self) {
        self.task.abort();
    }
}

impl Drop for StreamTask {
    fn drop(&mut self) {
        self.kill();
    }
}
