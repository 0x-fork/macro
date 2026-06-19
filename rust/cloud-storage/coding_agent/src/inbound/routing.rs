//! Stateless, signed routing tokens.
//!
//! When the Macro agent spawns a coding agent, it points the provider's status
//! webhook at a URL containing a routing token produced by [`sign_route_token`].
//! The token embeds the [`RouteTarget`] (who/where to deliver completion to) and
//! an HMAC over it keyed by the shared webhook secret. The receiver recovers and
//! authenticates it with [`verify_route_token`].
//!
//! This avoids any server-side `agent → owner` mapping table: the routing
//! information travels with the webhook and is tamper-evident.

#[cfg(test)]
mod test;

use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

use crate::domain::models::{CodingAgentError, RouteTarget};

type HmacSha256 = Hmac<Sha256>;

/// Encode a [`RouteTarget`] into a signed, URL-safe token: `<hex(payload)>.<hex(hmac)>`.
pub fn sign_route_token(secret: &str, route: &RouteTarget) -> String {
    let payload = serde_json::to_vec(route).expect("RouteTarget always serializes");
    let payload_hex = hex::encode(&payload);
    let signature = hex::encode(hmac(secret, payload_hex.as_bytes()));
    format!("{payload_hex}.{signature}")
}

/// Recover and authenticate a [`RouteTarget`] from a token produced by
/// [`sign_route_token`], using constant-time signature comparison.
pub fn verify_route_token(secret: &str, token: &str) -> Result<RouteTarget, CodingAgentError> {
    let (payload_hex, signature) = token.split_once('.').ok_or_else(|| {
        CodingAgentError::WebhookVerification("malformed routing token".to_owned())
    })?;

    let expected = hex::encode(hmac(secret, payload_hex.as_bytes()));
    let matches: bool = expected.as_bytes().ct_eq(signature.as_bytes()).into();
    if !matches {
        return Err(CodingAgentError::WebhookVerification(
            "routing token signature mismatch".to_owned(),
        ));
    }

    let payload = hex::decode(payload_hex).map_err(|e| {
        CodingAgentError::WebhookVerification(format!("invalid routing token payload: {e}"))
    })?;
    serde_json::from_slice(&payload).map_err(|e| {
        CodingAgentError::WebhookVerification(format!("invalid routing token payload: {e}"))
    })
}

fn hmac(secret: &str, message: &[u8]) -> Vec<u8> {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts keys of any length");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}
