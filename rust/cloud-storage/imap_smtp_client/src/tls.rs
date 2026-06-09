use std::sync::Arc;

use anyhow::Context;
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use tokio_rustls::client::TlsStream;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::{ClientConfig, RootCertStore};

/// Opens a TCP connection to `host:port` and performs an implicit TLS
/// handshake (TLS from the first byte), verifying the server certificate
/// against the bundled Mozilla root store.
pub(crate) async fn connect_tls(host: &str, port: u16) -> anyhow::Result<TlsStream<TcpStream>> {
    let tcp = TcpStream::connect((host, port))
        .await
        .with_context(|| format!("failed to connect to {host}:{port}"))?;
    upgrade_tls(tcp, host).await
}

/// Performs a TLS handshake over an already-established TCP stream (the
/// STARTTLS upgrade path).
pub(crate) async fn upgrade_tls(
    tcp: TcpStream,
    host: &str,
) -> anyhow::Result<TlsStream<TcpStream>> {
    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    // Pin the ring provider explicitly: relying on ClientConfig::builder()'s
    // process-default detection panics if another crate in the binary enables
    // a second rustls crypto provider.
    let config = ClientConfig::builder_with_provider(Arc::new(
        tokio_rustls::rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .context("failed to configure TLS protocol versions")?
    .with_root_certificates(roots)
    .with_no_client_auth();
    let connector = TlsConnector::from(Arc::new(config));

    let server_name = ServerName::try_from(host.to_string())
        .with_context(|| format!("invalid TLS server name: {host}"))?;

    connector
        .connect(server_name, tcp)
        .await
        .with_context(|| format!("TLS handshake with {host} failed"))
}
