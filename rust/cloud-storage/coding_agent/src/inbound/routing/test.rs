use super::*;

fn route() -> RouteTarget {
    RouteTarget {
        user_id: "macro|alice@macro.com".to_owned(),
        chat_id: Some("01234567-89ab-cdef-0123-456789abcdef".to_owned()),
    }
}

#[test]
fn round_trips() {
    let secret = "0123456789012345678901234567890123";
    let token = sign_route_token(secret, &route());
    let recovered = verify_route_token(secret, &token).unwrap();
    assert_eq!(recovered, route());
}

#[test]
fn rejects_wrong_secret() {
    let token = sign_route_token("0123456789012345678901234567890123", &route());
    assert!(verify_route_token("a-different-secret-aaaaaaaaaaaaaaaa", &token).is_err());
}

#[test]
fn rejects_tampered_payload() {
    let secret = "0123456789012345678901234567890123";
    let token = sign_route_token(secret, &route());
    let (_payload, sig) = token.split_once('.').unwrap();
    // Swap in a different payload while keeping the original signature.
    let forged_payload = hex::encode(
        serde_json::to_vec(&RouteTarget {
            user_id: "macro|attacker@evil.com".to_owned(),
            chat_id: None,
        })
        .unwrap(),
    );
    let forged = format!("{forged_payload}.{sig}");
    assert!(verify_route_token(secret, &forged).is_err());
}

#[test]
fn rejects_malformed_token() {
    let secret = "0123456789012345678901234567890123";
    assert!(verify_route_token(secret, "no-dot-here").is_err());
    assert!(verify_route_token(secret, "zzzz.zzzz").is_err());
}

#[test]
fn omits_chat_id_when_absent() {
    let secret = "0123456789012345678901234567890123";
    let route = RouteTarget {
        user_id: "macro|alice@macro.com".to_owned(),
        chat_id: None,
    };
    let token = sign_route_token(secret, &route);
    assert_eq!(verify_route_token(secret, &token).unwrap(), route);
}
