//! Generates a real, signed webhook delivery so it can be ingested by the TypeScript SDK's
//! `MacroEvents` verifier for testing.
//!
//! Uses the production signer (`webhook::outbound::signature_header`) directly, so the emitted
//! signature is byte-for-byte what Macro actually sends. Prints `{ secret, event, timestamp, body,
//! signature }` as JSON; `body` is the exact string that was signed, so the TS side must feed it
//! verbatim as the raw body.
//!
//! Run:
//!   cargo run -p webhook --example sign_webhook
//!   cargo run -p webhook --example sign_webhook -- <secret> <timestamp>

use webhook::outbound::signature_header;

fn main() {
    let mut args = std::env::args().skip(1);
    let secret = args.next().unwrap_or_else(|| "test-secret".to_string());
    let timestamp = args.next().unwrap_or_else(|| "1700000000".to_string());

    let event = "document.created";
    // Representative delivery body: `event_type` + `metadata`, the shape
    // @macro/sdk's MacroEvents parses.
    let body = serde_json::to_string(&serde_json::json!({
        "event_type": event,
        "metadata": { "document_id": "019f5265-463b-7952-9c25-fedd7a0f4b75" },
    }))
    .expect("serialize body");

    let signature =
        signature_header(&secret, &timestamp, body.as_bytes()).expect("sign body");

    let out = serde_json::json!({
        "secret": secret,
        "event": event,
        "timestamp": timestamp,
        "body": body,
        "signature": signature,
    });
    println!("{}", serde_json::to_string_pretty(&out).expect("serialize output"));
}
