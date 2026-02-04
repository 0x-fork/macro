use std::future::Future;
use tokio::task::JoinHandle;
use uuid::Uuid;

pub struct TaskBuilder {}

impl TaskBuilder {
    pub fn spawn<F>(task: F) -> (ActiveTask, Uuid)
    where
        F: Future<Output = ()> + Send + 'static,
    {
        let handle = tokio::task::spawn(task);
        let id = Uuid::new_v4();
        (ActiveTask { task: handle }, id)
    }

    pub fn delay<F, Fut>(task: F) -> (PendingTask<F>, Uuid)
    where
        F: FnOnce(Uuid) -> Fut,
        Fut: Future<Output = ()> + Send + 'static,
    {
        let id = Uuid::new_v4();
        (PendingTask { task, id }, id)
    }
}

pub struct PendingTask<F> {
    task: F,
    id: Uuid,
}

impl<F, Fut> PendingTask<F>
where
    F: FnOnce(Uuid) -> Fut,
    Fut: Future<Output = ()> + Send + 'static,
{
    pub fn begin(self) -> ActiveTask {
        let task = tokio::task::spawn((self.task)(self.id));
        ActiveTask { task }
    }
}

#[derive(Debug)]
pub struct ActiveTask {
    task: JoinHandle<()>,
}

impl ActiveTask {
    pub fn kill(&self) {
        self.task.abort();
    }
}

impl Drop for ActiveTask {
    fn drop(&mut self) {
        self.kill();
    }
}
