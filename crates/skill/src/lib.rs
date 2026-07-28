//! Skills: reusable markdown documents of AI instructions that users attach
//! to an AI chat input via a `/<skillname>` slash command. A skill's content
//! is resolved server-side and injected into the AI system prompt.
#![deny(missing_docs)]

pub mod domain;
#[cfg(feature = "inbound")]
pub mod inbound;
#[cfg(feature = "outbound")]
pub mod outbound;
