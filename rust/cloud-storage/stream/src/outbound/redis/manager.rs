use super::util::Task;
pub use crate::domain::{ItemStream, Result, StreamId, StreamManager, StreamRepo};
use async_trait::async_trait;
use dashmap::{DashMap, DashSet};
use futures::future::join_all;
use futures::StreamExt;
use std::sync::{Arc, Weak};
use tokio::sync::mpsc::Sender;

#[derive(Debug)]
struct Connection<T>(pub Arc<String>, pub Sender<T>);

impl<T> std::clone::Clone for Connection<T> {
    fn clone(&self) -> Self {
        Self(self.0.clone(), self.1.clone())
    }
}

impl<T> std::hash::Hash for Connection<T> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.0.hash(state)
    }
}

impl<T> std::cmp::PartialEq for Connection<T> {
    fn eq(&self, other: &Self) -> bool {
        self.0.eq(&other.0)
    }
}

impl<T> std::cmp::Eq for Connection<T> {}

type EntityId = String;

type SenderId = String;

pub struct RedisStreamManager<T> {
    service: Arc<dyn StreamRepo<T>>,
    subscribed_connections: Arc<DashMap<EntityId, DashSet<Connection<T>>>>,
    streaming_connections: Arc<DashMap<SenderId, DashSet<Task>>>,
    _notification_handler: Arc<Task>,
}

impl<T> RedisStreamManager<T>
where
    T: Send + Sync + 'static,
{
    pub fn new(service: Arc<dyn StreamRepo<T>>) -> Arc<Self> {
        // Use Arc::new_cyclic to avoid the chicken-and-egg problem
        Arc::new_cyclic(|weak: &Weak<Self>| {
            let this = weak.clone();
            let weak_repo = Arc::downgrade(&service);

            let notification_handler = Task::spawn(async move {
                let mut notification_receiver = match weak_repo.upgrade() {
                    Some(repo) => repo.notify().await,
                    None => panic!("Expected to be able to get strong reference to stream repo"),
                };

                while let Ok(stream_id) = notification_receiver.recv().await {
                    let Some(manager) = this.upgrade() else {
                        // manager dropped
                        break;
                    };
                    manager.handle_stream_created(stream_id).await;
                }
                tracing::warn!("Notification handler exited");
            });

            Self {
                service,
                subscribed_connections: Arc::new(DashMap::new()),
                streaming_connections: Arc::new(DashMap::new()),
                _notification_handler: Arc::new(notification_handler),
            }
        })
    }

    async fn handle_stream_created(self: Arc<Self>, stream_id: StreamId) {
        let Some(subscribers) = self.subscribed_connections.get(&stream_id.entity_id) else {
            return;
        };

        join_all(
            subscribers
                .iter()
                .map(|connection| {
                    self.clone()
                        .handle_stream_to_connection(&stream_id, connection.to_owned())
                })
                .collect::<Vec<_>>(),
        )
        .await;
    }

    #[tracing::instrument(err, skip(self, connection))]
    async fn handle_subscribe(
        self: Arc<Self>,
        entity_id: String,
        connection: Connection<T>,
    ) -> Result<()> {
        self.subscribed_connections
            .entry(entity_id.clone())
            .or_insert_with(|| DashSet::new())
            .insert(connection.clone());

        for stream_id in self
            .service
            .active_streams(entity_id.as_str())
            .await?
            .into_iter()
            .filter(|id| id.entity_id == entity_id)
        {
            let _ = self
                .clone()
                .handle_stream_to_connection(&stream_id, connection.clone())
                .await;
        }
        Ok(())
    }

    #[tracing::instrument(err, skip(self, connection))]
    async fn handle_stream_to_connection(
        self: Arc<Self>,
        stream_id: &StreamId,
        connection: Connection<T>,
    ) -> Result<()> {
        let mut stream = self.service.stream_from_beginning(stream_id).await?;
        let sender_id = connection.0.clone();
        let weak_manager = Arc::downgrade(&self);
        let task = Task::spawn(async move {
            while let Some(item) = stream.next().await {
                // full channel error may need to be handled
                if let Err(_) = connection.1.send(item).await {
                    if let Some(this) = weak_manager.upgrade() {
                        this.handle_disconnect(&connection).await;
                        break;
                    } else {
                        break;
                    }
                };
            }
        });

        self.streaming_connections
            .entry(sender_id.to_string())
            .or_insert_with(|| DashSet::new())
            .insert(task);

        Ok(())
    }

    async fn handle_disconnect(&self, connection: &Connection<T>) {
        // remove from subscribed map
        for entry in self.subscribed_connections.iter_mut() {
            entry.value().remove(connection);
        }

        self.subscribed_connections.retain(|_, v| !v.is_empty());

        // remove from streaming map and kill active tasks
        if let Some((_, active_streams)) = self.streaming_connections.remove(&*connection.0) {
            for task in active_streams.into_iter() {
                task.kill()
            }
            self.streaming_connections.remove(&*connection.0);
        }
    }
}

#[async_trait]
impl<T> StreamManager<T> for RedisStreamManager<T>
where
    T: Send + Sync + 'static,
{
    async fn subscribe(
        self: Arc<Self>,
        entity_id: String,
        sender_id: String,
        sender: Sender<T>,
    ) -> Result<()> {
        let connection = Connection(Arc::new(sender_id), sender);
        self.handle_subscribe(entity_id, connection).await
    }

    async fn unsubscribe(self: Arc<Self>, entity_id: &str, sender_id: &str) -> Result<()> {
        // Remove from subscribed_connections for this entity
        if let Some(subscribers) = self.subscribed_connections.get(entity_id) {
            subscribers.retain(|conn| conn.0.as_str() != sender_id);
        }

        // Kill streaming tasks for this sender
        if let Some((_, active_streams)) = self.streaming_connections.remove(sender_id) {
            for task in active_streams.into_iter() {
                task.kill();
            }
        }

        Ok(())
    }
}
