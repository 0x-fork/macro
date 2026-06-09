//! Symmetric encryption for email server credentials at rest.
//!
//! IMAP/SMTP links authenticate with a username + password (typically an app
//! password), which — unlike Gmail OAuth refresh tokens — we have to hold
//! ourselves. Passwords are encrypted with AES-256-GCM before being written to
//! Postgres; the key lives only in the email service's environment.
//!
//! Ciphertext layout: `nonce (12 bytes) || AES-256-GCM ciphertext+tag`.

use aes_gcm::aead::{Aead, OsRng, rand_core::RngCore};
use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce};
use anyhow::Context;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;

/// Environment variable holding the base64-encoded 32-byte AES-256 key used to
/// encrypt stored email server credentials.
pub const ENCRYPTION_KEY_ENV_VAR: &str = "EMAIL_CREDENTIALS_ENCRYPTION_KEY";

const NONCE_LEN: usize = 12;

/// An AES-256-GCM key for encrypting/decrypting stored credentials.
#[derive(Clone)]
pub struct CredentialKey {
    key: Key<Aes256Gcm>,
}

impl std::fmt::Debug for CredentialKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Never print key material.
        f.debug_struct("CredentialKey").finish_non_exhaustive()
    }
}

impl CredentialKey {
    /// Parses a key from its base64 representation (32 bytes once decoded).
    pub fn from_base64(encoded: &str) -> anyhow::Result<Self> {
        let bytes = STANDARD
            .decode(encoded.trim())
            .context("credential encryption key is not valid base64")?;
        let bytes: [u8; 32] = bytes.as_slice().try_into().map_err(|_| {
            anyhow::anyhow!(
                "credential encryption key must be 32 bytes, got {}",
                bytes.len()
            )
        })?;
        Ok(Self {
            key: Key::<Aes256Gcm>::from(bytes),
        })
    }

    /// Loads the key from the `EMAIL_CREDENTIALS_ENCRYPTION_KEY` environment variable.
    pub fn from_env() -> anyhow::Result<Self> {
        let encoded = std::env::var(ENCRYPTION_KEY_ENV_VAR)
            .with_context(|| format!("{ENCRYPTION_KEY_ENV_VAR} is not set"))?;
        Self::from_base64(&encoded)
    }

    /// Encrypts a credential, returning `nonce || ciphertext+tag`.
    pub fn encrypt(&self, plaintext: &str) -> anyhow::Result<Vec<u8>> {
        let cipher = Aes256Gcm::new(&self.key);

        let mut nonce_bytes = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce_bytes);

        let ciphertext = cipher
            .encrypt(&Nonce::from(nonce_bytes), plaintext.as_bytes())
            .map_err(|_| anyhow::anyhow!("failed to encrypt credential"))?;

        let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        out.extend_from_slice(&nonce_bytes);
        out.extend_from_slice(&ciphertext);
        Ok(out)
    }

    /// Decrypts a credential previously produced by [`CredentialKey::encrypt`].
    pub fn decrypt(&self, data: &[u8]) -> anyhow::Result<String> {
        anyhow::ensure!(
            data.len() > NONCE_LEN,
            "credential ciphertext too short ({} bytes)",
            data.len()
        );
        let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
        let nonce_bytes: [u8; NONCE_LEN] = nonce_bytes
            .try_into()
            .expect("split_at(NONCE_LEN) yields exactly NONCE_LEN bytes");

        let cipher = Aes256Gcm::new(&self.key);
        let plaintext = cipher
            .decrypt(&Nonce::from(nonce_bytes), ciphertext)
            .map_err(|_| anyhow::anyhow!("failed to decrypt credential"))?;

        String::from_utf8(plaintext).context("decrypted credential is not valid UTF-8")
    }
}

#[cfg(test)]
mod test;
