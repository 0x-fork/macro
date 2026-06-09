//! SMTP side of the client: submitting outgoing mail.

use anyhow::Context;
use mail_builder::headers::address::Address;
use mail_send::SmtpClientBuilder;
use mail_send::smtp::message::Message as SmtpEnvelope;
use models_email::email::service::address::ContactInfo;
use models_email::email::service::message::MessageToSend;
use models_email::service::imap::{ConnectionSecurity, ServerSettings};

/// Connects and authenticates against the SMTP server, then disconnects.
/// Used to validate user-supplied settings before persisting them.
#[tracing::instrument(skip(settings), fields(host = %settings.host, port = settings.port), err)]
pub async fn verify(settings: &ServerSettings) -> anyhow::Result<()> {
    connect(settings).await.map(|_| ())
}

async fn connect(
    settings: &ServerSettings,
) -> anyhow::Result<mail_send::SmtpClient<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>> {
    let implicit_tls = match settings.security {
        ConnectionSecurity::SslTls => true,
        ConnectionSecurity::Starttls => false,
    };

    SmtpClientBuilder::new(settings.host.clone(), settings.port)
        .map_err(|e| anyhow::anyhow!("failed to build SMTP TLS connector: {e}"))?
        .implicit_tls(implicit_tls)
        .credentials((settings.username.clone(), settings.password.clone()))
        .connect()
        .await
        .with_context(|| {
            format!(
                "SMTP connection to {}:{} failed; check the host, port, username and password",
                settings.host, settings.port
            )
        })
}

/// Sends a message over SMTP, mirroring `gmail_client`'s `send_message`.
///
/// A fresh `Message-ID` is generated and recorded on the message: since SMTP
/// servers don't hand back a provider id the way the Gmail API does, the
/// Message-ID (with angle brackets, matching how synced messages store their
/// `global_id`) doubles as the message's `provider_id`. The thread keeps its
/// existing `provider_thread_id` for replies and falls back to the new
/// Message-ID for brand-new threads.
///
/// Returns the raw RFC 5322 bytes that were submitted so the caller can file
/// a copy into the IMAP sent folder (servers don't do this for SMTP
/// submissions automatically).
#[tracing::instrument(skip(settings, message), fields(link_id = %message.link_id), err)]
pub async fn send_message(
    settings: &ServerSettings,
    message: &mut MessageToSend,
    from_contact: &ContactInfo,
    parent_message_id: Option<String>,
    references: Option<Vec<String>>,
) -> anyhow::Result<Vec<u8>> {
    let domain = from_contact
        .email
        .rsplit('@')
        .next()
        .filter(|d| !d.is_empty())
        .unwrap_or("localhost");
    let message_id = format!("{}@{}", macro_uuid::generate_uuid_v7(), domain);

    let mut builder = mail_builder::MessageBuilder::new()
        .message_id(message_id.clone())
        .from(contact_to_address(from_contact))
        .to(contacts_to_address_list(&message.to))
        .cc(contacts_to_address_list(&message.cc))
        .bcc(contacts_to_address_list(&message.bcc))
        .subject(&message.subject);

    if let Some(parent_message_id) = parent_message_id {
        builder = builder.in_reply_to(parent_message_id);
    }

    if let Some(references) = references {
        builder = builder.references(references);
    }

    if let Some(text_body) = &message.body_text {
        builder = builder.text_body(text_body);
    }

    if let Some(html_body) = &message.body_html {
        builder = builder.html_body(html_body);
    }

    if let Some(attachments) = message.attachments.take() {
        for att in attachments {
            builder = builder.attachment(att.content_type, att.file_name, att.data);
        }
    }

    let email_bytes = builder.write_to_vec().context("building message error")?;

    // The SMTP envelope carries all recipients explicitly, including BCC
    // (which mail_builder intentionally leaves out of the message headers).
    let recipients: Vec<String> = [&message.to, &message.cc, &message.bcc]
        .into_iter()
        .flatten()
        .flatten()
        .map(|c| c.email.clone())
        .collect();
    anyhow::ensure!(!recipients.is_empty(), "message has no recipients");

    let envelope = SmtpEnvelope::new(
        from_contact.email.clone(),
        recipients,
        email_bytes.as_slice(),
    );

    let mut client = connect(settings).await?;
    client
        .send(envelope)
        .await
        .with_context(|| format!("SMTP send failed for link_id: {}", message.link_id))?;
    client.quit().await.ok();

    // Match the bracketed format synced messages use for global_id, so the
    // copy of this message later seen via IMAP dedupes against this row.
    let bracketed = format!("<{message_id}>");
    message.provider_id = Some(bracketed.clone());
    if message.provider_thread_id.is_none() {
        message.provider_thread_id = Some(bracketed);
    }

    Ok(email_bytes)
}

fn contact_to_address(contact: &ContactInfo) -> Address<'_> {
    match &contact.name {
        Some(name) => Address::new_address(Some(name.as_str()), contact.email.as_str()),
        None => Address::new_address(None::<&str>, contact.email.as_str()),
    }
}

fn contacts_to_address_list(contacts: &Option<Vec<ContactInfo>>) -> Address<'_> {
    let contacts = contacts.as_ref();
    if contacts.is_none_or(|c| c.is_empty()) {
        return Address::new_list(Vec::new());
    }

    let addresses: Vec<Address> = contacts.unwrap().iter().map(contact_to_address).collect();

    Address::new_list(addresses)
}
