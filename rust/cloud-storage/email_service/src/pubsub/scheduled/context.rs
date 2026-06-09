use crate::util::redis::RedisClient;
use authentication_service_client::AuthServiceClient;
use gmail_client::GmailClient;
use sqlx::PgPool;

#[derive(Clone)]
pub struct ScheduledContext {
    pub db: PgPool,
    pub sqs_worker: sqs_worker::SQSWorker,
    pub gmail_client: GmailClient,
    pub auth_service_client: AuthServiceClient,
    pub redis_client: RedisClient,
    pub s3_client: s3_client::S3,
    pub attachment_bucket: String,
    /// Key for decrypting stored IMAP/SMTP credentials; `None` when IMAP/SMTP
    /// links aren't configured for this deployment.
    pub credential_key: Option<email_utils::credential_crypto::CredentialKey>,
}
