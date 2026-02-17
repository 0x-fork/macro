//! Email entity commands for seeding email data.
//!
//! Workflow:
//! 1. `generate` creates a JSON file with randomized email seed data
//! 2. `import` reads a JSON file and inserts the data into the database
//!
//! This two-step process allows developers to share seed data files.

#[cfg(test)]
mod test;

mod sample_bodies;

use std::path::Path;

use anyhow::Context;
use chrono::{DateTime, Duration, Utc};
use clap::{Args, Subcommand};
use models_email::email::service::address::ContactInfo;
use models_email::email::service::label::{
    Label, LabelListVisibility, LabelType, MessageListVisibility,
};
use models_email::email::service::link::UserProvider;
use models_email::email::service::message::Message;
use models_email::email::service::thread::Thread;
use rand::Rng;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::config::SeedCliContext;

/// Arguments for the `email` entity subcommand.
#[derive(Debug, Args)]
pub struct EmailArgs {
    /// The action to perform on emails
    #[command(subcommand)]
    pub command: EmailCommand,
}

/// Available commands for the email entity.
#[derive(Debug, Subcommand)]
pub enum EmailCommand {
    /// Generate a JSON file of randomized email seed data
    Generate(GenerateArgs),
    /// Import email data from a JSON file into the database
    Import(ImportArgs),
}

/// Arguments for generating random email data.
#[derive(Debug, Args)]
pub struct GenerateArgs {
    /// The user ID (fusionauth) to generate emails for
    #[arg(long)]
    pub user_id: String,
    /// The email address of the user
    #[arg(long)]
    pub email_address: String,
    /// Number of threads to generate
    #[arg(long, default_value = "10")]
    pub thread_count: u32,
    /// Max messages per thread (actual count is random between 1 and this value)
    #[arg(long, default_value = "10")]
    pub max_messages_per_thread: u32,
    /// Output file name for the generated JSON (written to src/entity/email/generated_output/)
    #[arg(long, default_value = "seed_emails.json")]
    pub output: String,
}

/// Arguments for importing email data from a file.
#[derive(Debug, Args)]
pub struct ImportArgs {
    /// Path to the JSON file containing email data to import
    #[arg(long)]
    pub file_path: String,
}

/// The top-level seed data structure that gets serialized to JSON.
#[derive(Debug, Serialize, Deserialize)]
pub struct SeedEmailData {
    /// The fusionauth user ID that owns this email data
    pub user_id: String,
    /// The email address of the owner
    pub email_address: String,
    /// The email provider
    pub provider: UserProvider,
    /// Labels to create for the user
    pub labels: Vec<SeedLabel>,
    /// Threads with their messages
    pub threads: Vec<SeedThread>,
}

/// A label in the seed data.
#[derive(Debug, Serialize, Deserialize)]
pub struct SeedLabel {
    /// The provider label ID (e.g. "INBOX", "SENT")
    pub provider_label_id: String,
    /// Display name
    pub name: String,
    /// Label type
    pub label_type: LabelType,
}

/// A thread in the seed data.
#[derive(Debug, Serialize, Deserialize)]
pub struct SeedThread {
    /// Provider thread ID (random hex string)
    pub provider_id: String,
    /// Whether the thread should appear in the inbox
    pub inbox_visible: bool,
    /// Whether the thread is read
    pub is_read: bool,
    /// The messages in this thread
    pub messages: Vec<SeedMessage>,
}

/// A message in the seed data.
#[derive(Debug, Serialize, Deserialize)]
pub struct SeedMessage {
    /// Provider message ID (random hex string)
    pub provider_id: String,
    /// The subject line
    pub subject: Option<String>,
    /// Short snippet
    pub snippet: Option<String>,
    /// When the message was sent
    pub sent_at: DateTime<Utc>,
    /// Whether the message has been read
    pub is_read: bool,
    /// Whether the message is starred
    pub is_starred: bool,
    /// Whether the message was sent by the owner
    pub is_sent: bool,
    /// Sender contact
    pub from: ContactInfo,
    /// To recipients
    pub to: Vec<ContactInfo>,
    /// CC recipients
    pub cc: Vec<ContactInfo>,
    /// Plaintext body
    pub body_text: Option<String>,
    /// HTML body
    pub body_html: Option<String>,
    /// Label provider IDs to apply to this message
    pub label_ids: Vec<String>,
}

/// Fake contacts used for generating seed data.
const FAKE_CONTACTS: &[(&str, &str)] = &[
    ("fakecontact1@gmail.com", "Alice Johnson"),
    ("fakecontact2@gmail.com", "Bob Smith"),
    ("fakecontact3@gmail.com", "Carol Williams"),
    ("fakecontact4@gmail.com", "David Brown"),
    ("fakecontact5@gmail.com", "Eve Davis"),
    ("fakecontact6@gmail.com", "Frank Miller"),
    ("fakecontact7@gmail.com", "Grace Wilson"),
    ("fakecontact8@gmail.com", "Henry Moore"),
    ("fakecontact9@gmail.com", "Irene Taylor"),
];

/// All system labels to create for each user.
const SYSTEM_LABELS: &[(&str, &str)] = &[
    ("INBOX", "INBOX"),
    ("SPAM", "SPAM"),
    ("TRASH", "TRASH"),
    ("UNREAD", "UNREAD"),
    ("STARRED", "STARRED"),
    ("IMPORTANT", "IMPORTANT"),
    ("SENT", "SENT"),
    ("DRAFT", "DRAFT"),
    ("CATEGORY_PERSONAL", "CATEGORY_PERSONAL"),
    ("CATEGORY_SOCIAL", "CATEGORY_SOCIAL"),
    ("CATEGORY_PROMOTIONS", "CATEGORY_PROMOTIONS"),
    ("CATEGORY_UPDATES", "CATEGORY_UPDATES"),
    ("CATEGORY_FORUMS", "CATEGORY_FORUMS"),
];

/// Subject lines to randomly pick from.
const SUBJECTS: &[&str] = &[
    "Meeting Follow-up",
    "Project Update",
    "Quick Question",
    "Welcome to the Team",
    "Invoice for January",
    "Re: Design Review",
    "Lunch tomorrow?",
    "Action Required: Q3 Planning",
    "FYI - Policy Update",
    "Thanks for your help!",
    "Scheduling conflict",
    "New feature request",
    "Bug report: search not working",
    "Weekly standup notes",
    "Feedback on the proposal",
];

/// Labels that can be randomly assigned to inbox messages (excluding structural ones).
const RANDOM_MESSAGE_LABELS: &[&str] = &[
    "CATEGORY_PERSONAL",
    "CATEGORY_SOCIAL",
    "CATEGORY_PROMOTIONS",
    "CATEGORY_UPDATES",
    "CATEGORY_FORUMS",
    "IMPORTANT",
];

impl EmailArgs {
    /// Execute the email command.
    pub async fn execute(self, ctx: SeedCliContext) -> anyhow::Result<()> {
        match self.command {
            EmailCommand::Generate(args) => generate(args).await,
            EmailCommand::Import(args) => import(args, ctx).await,
        }
    }
}

#[tracing::instrument(err)]
async fn generate(args: GenerateArgs) -> anyhow::Result<()> {
    tracing::info!("generating email seed data");

    let mut rng = rand::rng();
    let bodies = sample_bodies::load_sample_bodies();

    let labels: Vec<SeedLabel> = SYSTEM_LABELS
        .iter()
        .map(|(id, name)| SeedLabel {
            provider_label_id: id.to_string(),
            name: name.to_string(),
            label_type: LabelType::System,
        })
        .collect();

    let owner_contact = ContactInfo {
        email: args.email_address.clone(),
        name: Some("Me".to_string()),
        photo_url: None,
    };

    let mut threads = Vec::with_capacity(args.thread_count as usize);
    let now = Utc::now();

    for i in 0..args.thread_count {
        let message_count = rng.random_range(1..=args.max_messages_per_thread);
        let is_read = rng.random_bool(0.6);
        let subject = SUBJECTS[rng.random_range(0..SUBJECTS.len())].to_string();

        // Pick a base time going backwards from now, older threads further back
        let thread_base_time =
            now - Duration::hours((args.thread_count - i) as i64 * 24 + rng.random_range(0..12));

        let mut messages = Vec::with_capacity(message_count as usize);

        for j in 0..message_count {
            let msg_time =
                thread_base_time + Duration::minutes(j as i64 * rng.random_range(5..120));
            let is_sent_by_owner = rng.random_bool(0.3);

            let (from, to, cc) = if is_sent_by_owner {
                let recipient_count = rng.random_range(1..=3);
                let recipients = pick_random_contacts(&mut rng, recipient_count);
                let cc_contacts = if rng.random_bool(0.2) {
                    pick_random_contacts(&mut rng, 1)
                } else {
                    vec![]
                };
                (owner_contact.clone(), recipients, cc_contacts)
            } else {
                let sender_idx = rng.random_range(0..FAKE_CONTACTS.len());
                let sender = make_contact(FAKE_CONTACTS[sender_idx]);
                let mut to_list = vec![owner_contact.clone()];
                if rng.random_bool(0.2) {
                    to_list.extend(pick_random_contacts(&mut rng, 1));
                }
                let cc_contacts = if rng.random_bool(0.15) {
                    let cc_count = rng.random_range(1..=2);
                    pick_random_contacts(&mut rng, cc_count)
                } else {
                    vec![]
                };
                (sender, to_list, cc_contacts)
            };

            let (body_text, body_html) = &bodies[rng.random_range(0..bodies.len())];

            // Build label set for this message
            let mut label_ids = Vec::new();
            if !is_sent_by_owner {
                label_ids.push("INBOX".to_string());
            }
            if is_sent_by_owner {
                label_ids.push("SENT".to_string());
            }
            if !is_read {
                label_ids.push("UNREAD".to_string());
            }
            // Add a random category/important label
            if rng.random_bool(0.5) {
                let random_label =
                    RANDOM_MESSAGE_LABELS[rng.random_range(0..RANDOM_MESSAGE_LABELS.len())];
                if !label_ids.contains(&random_label.to_string()) {
                    label_ids.push(random_label.to_string());
                }
            }

            let snippet = body_text
                .as_ref()
                .map(|t| t.chars().take(100).collect::<String>());

            messages.push(SeedMessage {
                provider_id: random_hex_id(&mut rng),
                subject: Some(subject.clone()),
                snippet,
                sent_at: msg_time,
                is_read: is_read || j < message_count - 1, // older messages in thread are read
                is_starred: rng.random_bool(0.1),
                is_sent: is_sent_by_owner,
                from,
                to,
                cc,
                body_text: body_text.clone(),
                body_html: body_html.clone(),
                label_ids,
            });
        }

        let has_inbound = messages.iter().any(|m| !m.is_sent);

        threads.push(SeedThread {
            provider_id: random_hex_id(&mut rng),
            inbox_visible: has_inbound,
            is_read,
            messages,
        });
    }

    let seed_data = SeedEmailData {
        user_id: args.user_id,
        email_address: args.email_address,
        provider: UserProvider::Gmail,
        labels,
        threads,
    };

    let json = serde_json::to_string_pretty(&seed_data).context("failed to serialize seed data")?;

    let output_dir =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("src/entity/email/generated_output");
    std::fs::create_dir_all(&output_dir).with_context(|| {
        format!(
            "failed to create output directory: {}",
            output_dir.display()
        )
    })?;

    let output_path = output_dir.join(&args.output);
    std::fs::write(&output_path, &json)
        .with_context(|| format!("failed to write output file: {}", output_path.display()))?;

    println!(
        "Generated seed data with {} threads to {}",
        args.thread_count,
        output_path.display()
    );

    Ok(())
}

#[tracing::instrument(skip(ctx), err)]
async fn import(args: ImportArgs, ctx: SeedCliContext) -> anyhow::Result<()> {
    tracing::info!("importing email seed data");

    let content = std::fs::read_to_string(Path::new(&args.file_path))
        .with_context(|| format!("failed to read json file: {}", args.file_path))?;

    let seed_data: SeedEmailData =
        serde_json::from_str(&content).context("failed to parse seed data json")?;

    // 1. Create the email link
    let macro_id = macro_user_id::user_id::MacroUserIdStr::try_from_email(&seed_data.email_address)
        .context("failed to create macro user id from email")?;
    let email_str = macro_user_id::email::EmailStr::try_from(seed_data.email_address.clone())
        .context("failed to parse email address")?;

    let now = Utc::now();
    let link = models_email::email::service::link::Link {
        id: Uuid::now_v7(),
        macro_id,
        fusionauth_user_id: seed_data.user_id.clone(),
        email_address: email_str,
        provider: seed_data.provider,
        is_sync_active: true,
        created_at: now,
        updated_at: now,
    };

    let link = ctx.db.upsert_email_link(link).await?;
    let link_id = link.id;
    println!("Created email link with id {link_id}");

    // 2. Create labels
    let labels: Vec<Label> = seed_data
        .labels
        .iter()
        .map(|l| Label {
            id: None,
            link_id,
            provider_label_id: l.provider_label_id.clone(),
            name: Some(l.name.clone()),
            created_at: now,
            message_list_visibility: Some(MessageListVisibility::Show),
            label_list_visibility: Some(LabelListVisibility::LabelShow),
            type_: Some(l.label_type),
        })
        .collect();

    ctx.db.insert_email_labels(labels).await?;
    println!("Created {} labels", seed_data.labels.len());

    // 3. Insert threads with messages
    let mut created = 0;
    let mut failed = 0;

    for seed_thread in &seed_data.threads {
        let thread_id = Uuid::now_v7();
        let latest_sent_at = seed_thread.messages.last().map(|m| m.sent_at);
        let latest_inbound = seed_thread
            .messages
            .iter()
            .rev()
            .find(|m| !m.is_sent)
            .map(|m| m.sent_at);
        let latest_outbound = seed_thread
            .messages
            .iter()
            .rev()
            .find(|m| m.is_sent)
            .map(|m| m.sent_at);

        let messages: Vec<Message> = seed_thread
            .messages
            .iter()
            .map(|m| {
                let msg_labels: Vec<Label> = m
                    .label_ids
                    .iter()
                    .map(|lid| Label {
                        id: None,
                        link_id,
                        provider_label_id: lid.clone(),
                        name: Some(lid.clone()),
                        created_at: now,
                        message_list_visibility: None,
                        label_list_visibility: None,
                        type_: None,
                    })
                    .collect();

                Message {
                    db_id: Uuid::now_v7(),
                    provider_id: Some(m.provider_id.clone()),
                    thread_db_id: thread_id,
                    provider_thread_id: Some(seed_thread.provider_id.clone()),
                    replying_to_id: None,
                    global_id: None,
                    link_id,
                    subject: m.subject.clone(),
                    snippet: m.snippet.clone(),
                    provider_history_id: None,
                    internal_date_ts: Some(m.sent_at),
                    sent_at: Some(m.sent_at),
                    size_estimate: None,
                    is_read: m.is_read,
                    is_starred: m.is_starred,
                    is_sent: m.is_sent,
                    is_draft: false,
                    scheduled_send_time: None,
                    has_attachments: false,
                    from: Some(m.from.clone()),
                    to: m.to.clone(),
                    cc: m.cc.clone(),
                    bcc: vec![],
                    labels: msg_labels,
                    body_text: m.body_text.clone(),
                    body_html_sanitized: m.body_html.clone(),
                    body_macro: None,
                    attachments: vec![],
                    attachments_draft: vec![],
                    attachments_forwarded: vec![],
                    headers_json: None,
                    created_at: m.sent_at,
                    updated_at: m.sent_at,
                }
            })
            .collect();

        let thread = Thread {
            db_id: thread_id,
            provider_id: Some(seed_thread.provider_id.clone()),
            link_id,
            inbox_visible: seed_thread.inbox_visible,
            is_read: seed_thread.is_read,
            latest_inbound_message_ts: latest_inbound,
            latest_outbound_message_ts: latest_outbound,
            latest_non_spam_message_ts: latest_sent_at,
            created_at: seed_thread
                .messages
                .first()
                .map(|m| m.sent_at)
                .unwrap_or(now),
            updated_at: latest_sent_at.unwrap_or(now),
            messages,
        };

        let subject_label = seed_thread
            .messages
            .first()
            .and_then(|m| m.subject.as_deref())
            .unwrap_or("<no subject>");

        match ctx.db.insert_email_thread(thread, link_id).await {
            Ok(id) => {
                println!("Created thread \"{subject_label}\" with id {id}");
                created += 1;
            }
            Err(e) => {
                tracing::error!(error=?e, subject = subject_label, "failed to create thread");
                println!("Failed to create thread \"{subject_label}\": {e}");
                failed += 1;
            }
        }
    }

    println!("\nImport complete: {created} threads created, {failed} failed");

    Ok(())
}

fn make_contact(contact: (&str, &str)) -> ContactInfo {
    ContactInfo {
        email: contact.0.to_string(),
        name: Some(contact.1.to_string()),
        photo_url: None,
    }
}

fn pick_random_contacts(rng: &mut impl Rng, count: usize) -> Vec<ContactInfo> {
    let mut indices: Vec<usize> = (0..FAKE_CONTACTS.len()).collect();
    let mut selected = Vec::with_capacity(count);
    for _ in 0..count.min(FAKE_CONTACTS.len()) {
        let idx = rng.random_range(0..indices.len());
        let contact_idx = indices.swap_remove(idx);
        selected.push(make_contact(FAKE_CONTACTS[contact_idx]));
    }
    selected
}

/// Generate a random 16-character hex string (8 random bytes).
fn random_hex_id(rng: &mut impl Rng) -> String {
    let bytes: [u8; 8] = rng.random();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
