#![deny(missing_docs)]
//! Personal WhatsApp accounts linked as devices: pairing, adding chats as
//! independently shared entities, inbound ingestion and deliberate sends. DSS serves the HTTP
//! API; the WhatsApp session service calls [`domain::session::SessionService`]
//! in-process. The two coordinate only through Postgres rows and `NOTIFY`.

/// Models, ports and use cases.
pub mod domain;
/// DSS HTTP routes.
#[cfg(feature = "inbound")]
pub mod inbound;
/// Postgres adapters.
#[cfg(feature = "outbound")]
pub mod outbound;
/// `NOTIFY` channels and payloads shared by DSS and the session service.
pub mod signals;
