use super::*;

fn test_key() -> CredentialKey {
    // 32 zero bytes, base64-encoded.
    CredentialKey::from_base64(&STANDARD.encode([0u8; 32])).unwrap()
}

#[test]
fn encrypt_decrypt_roundtrip() {
    let key = test_key();
    let ciphertext = key.encrypt("hunter2-app-password").unwrap();
    assert_ne!(ciphertext, b"hunter2-app-password");
    assert_eq!(key.decrypt(&ciphertext).unwrap(), "hunter2-app-password");
}

#[test]
fn nonces_are_unique_per_encryption() {
    let key = test_key();
    let a = key.encrypt("same input").unwrap();
    let b = key.encrypt("same input").unwrap();
    assert_ne!(a, b);
}

#[test]
fn decrypt_rejects_tampered_ciphertext() {
    let key = test_key();
    let mut ciphertext = key.encrypt("secret").unwrap();
    let last = ciphertext.len() - 1;
    ciphertext[last] ^= 0xff;
    assert!(key.decrypt(&ciphertext).is_err());
}

#[test]
fn decrypt_rejects_wrong_key() {
    let key = test_key();
    let other = CredentialKey::from_base64(&STANDARD.encode([1u8; 32])).unwrap();
    let ciphertext = key.encrypt("secret").unwrap();
    assert!(other.decrypt(&ciphertext).is_err());
}

#[test]
fn from_base64_rejects_wrong_length() {
    assert!(CredentialKey::from_base64(&STANDARD.encode([0u8; 16])).is_err());
    assert!(CredentialKey::from_base64("not base64!!").is_err());
}
