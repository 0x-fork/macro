use super::*;

fn fetched(body: &str, seen: bool) -> FetchedMessage {
    FetchedMessage {
        uid: 7,
        seen,
        flagged: false,
        draft: false,
        internal_date: Some(Utc.with_ymd_and_hms(2026, 6, 1, 12, 0, 0).unwrap()),
        body: body.replace('\n', "\r\n").into_bytes(),
    }
}

const SIMPLE_MESSAGE: &str = "\
Message-ID: <abc-123@example.com>
Date: Mon, 1 Jun 2026 08:00:00 -0400
From: Alice Sender <alice@example.com>
To: Bob Recipient <bob@example.net>
Cc: carol@example.org
Subject: Hello world
References: <root@example.com> <mid@example.com>
In-Reply-To: <mid@example.com>
Content-Type: text/plain; charset=utf-8

This is the   body of the message.
";

#[test]
fn maps_simple_plaintext_message() {
    let link_id = uuid::Uuid::nil();
    let mapped =
        map_imap_message_to_service(&fetched(SIMPLE_MESSAGE, false), link_id, "INBOX", 1, false)
            .unwrap();

    let m = &mapped.message;
    assert_eq!(m.global_id.as_deref(), Some("<abc-123@example.com>"));
    assert_eq!(m.provider_id.as_deref(), Some("<abc-123@example.com>"));
    assert_eq!(m.subject.as_deref(), Some("Hello world"));
    assert_eq!(m.from.as_ref().unwrap().email, "alice@example.com");
    assert_eq!(
        m.from.as_ref().unwrap().name.as_deref(),
        Some("Alice Sender")
    );
    assert_eq!(m.to.len(), 1);
    assert_eq!(m.to[0].email, "bob@example.net");
    assert_eq!(m.cc.len(), 1);
    assert!(!m.is_read);
    assert!(!m.is_sent);
    assert!(!m.is_draft);
    assert!(
        m.body_text
            .as_deref()
            .unwrap()
            .contains("body of the message")
    );
    assert_eq!(
        m.snippet.as_deref(),
        Some("This is the body of the message.")
    );
    assert!(m.sent_at.is_some());

    // Ancestors come from References + In-Reply-To, deduped, oldest first.
    assert_eq!(
        mapped.ancestor_global_ids,
        vec!["<root@example.com>", "<mid@example.com>"]
    );

    // Unseen inbox message gets INBOX + UNREAD labels.
    let label_ids: Vec<&str> = m
        .labels
        .iter()
        .map(|l| l.provider_label_id.as_str())
        .collect();
    assert_eq!(label_ids, vec!["INBOX", "UNREAD"]);
}

#[test]
fn sent_folder_message_gets_sent_label_and_is_read() {
    let mapped = map_imap_message_to_service(
        &fetched(SIMPLE_MESSAGE, true),
        uuid::Uuid::nil(),
        "Sent",
        1,
        true,
    )
    .unwrap();

    let m = &mapped.message;
    assert!(m.is_sent);
    assert!(m.is_read);
    let label_ids: Vec<&str> = m
        .labels
        .iter()
        .map(|l| l.provider_label_id.as_str())
        .collect();
    assert_eq!(label_ids, vec!["SENT"]);
}

const MULTIPART_MESSAGE: &str = "\
Message-ID: <multi@example.com>
From: alice@example.com
To: bob@example.net
Subject: With attachment
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary=\"outer\"

--outer
Content-Type: multipart/alternative; boundary=\"inner\"

--inner
Content-Type: text/plain; charset=utf-8

plain body
--inner
Content-Type: text/html; charset=utf-8

<p>html body</p><script>alert(1)</script>
--inner--
--outer
Content-Type: application/pdf; name=\"Report.PDF\"
Content-Disposition: attachment; filename=\"Report.PDF\"
Content-Transfer-Encoding: base64

aGVsbG8=
--outer--
";

#[test]
fn maps_multipart_with_attachment() {
    let mapped = map_imap_message_to_service(
        &fetched(MULTIPART_MESSAGE, true),
        uuid::Uuid::nil(),
        "INBOX",
        1,
        false,
    )
    .unwrap();

    let m = &mapped.message;
    assert_eq!(m.body_text.as_deref().map(str::trim), Some("plain body"));
    let html = m.body_html_sanitized.as_deref().unwrap();
    assert!(html.contains("html body"));
    assert!(
        !html.contains("<script>"),
        "html should be sanitized: {html}"
    );

    assert!(m.has_attachments);
    assert_eq!(m.attachments.len(), 1);
    let att = &m.attachments[0];
    assert_eq!(att.filename.as_deref(), Some("Report.pdf"));
    assert_eq!(att.mime_type.as_deref(), Some("application/pdf"));
    assert_eq!(att.size_bytes, Some(5));
}

#[test]
fn synthesizes_message_id_when_missing() {
    let body = "\
From: alice@example.com
To: bob@example.net
Subject: no message id

hi
";
    let link_id = uuid::Uuid::nil();
    let mapped =
        map_imap_message_to_service(&fetched(body, true), link_id, "INBOX", 42, false).unwrap();
    let global_id = mapped.message.global_id.unwrap();
    assert!(global_id.starts_with(&format!("<imap-{link_id}-INBOX-42-7")));

    // Same coordinates synthesize the same id, so re-polls dedupe.
    let mapped_again =
        map_imap_message_to_service(&fetched(body, true), link_id, "INBOX", 42, false).unwrap();
    assert_eq!(mapped_again.message.global_id.unwrap(), global_id);
}
