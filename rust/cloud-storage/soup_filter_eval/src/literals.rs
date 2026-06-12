//! Per-entity literal evaluation.
//!
//! Each function documents the SQL it mirrors. Literals that depend on data
//! the soup payload does not carry evaluate to [`Truth::Unknown`].

pub(crate) mod call;
pub(crate) mod channel;
pub(crate) mod chat;
pub(crate) mod crm_company;
pub(crate) mod document;
pub(crate) mod email;
pub(crate) mod foreign_entity;
pub(crate) mod project;
pub(crate) mod properties;
