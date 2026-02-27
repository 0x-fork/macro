//! Toolset inbound adapter for Email.

mod search_threads;

#[cfg(test)]
mod test;

use crate::domain::ports::EmailService;
use ai::tool::AsyncToolSet;
use search_threads::SearchEmailThreads;
use std::sync::Arc;

/// Service context for email AI tools
pub struct EmailToolContext<T: EmailService> {
    /// The email service instance
    pub service: Arc<T>,
}

impl<T: EmailService> Clone for EmailToolContext<T> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
        }
    }
}

impl<T: EmailService> EmailToolContext<T> {
    /// Create a new email tool context
    pub fn new(service: T) -> Self {
        Self {
            service: Arc::new(service),
        }
    }
}

/// Create an email toolset
pub fn email_toolset<T>() -> AsyncToolSet<EmailToolContext<T>>
where
    T: EmailService,
{
    AsyncToolSet::new()
        .add_tool::<SearchEmailThreads, EmailToolContext<T>>()
        .expect("failed to add SearchEmailThreads tool")
}
