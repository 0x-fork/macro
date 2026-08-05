#![deny(missing_docs)]
//! Materializes the append-only `activity_events` log from domain broker
//! events.
//!
//! One fact: a principal did something to an entity at a time. Every
//! activity surface (feeds, entity timelines, soup attribution sorts) is a
//! query over the single `activity_events` table this crate writes; there
//! are no derived tables.
//!
//! Hexagonal layout: [`domain`] holds the fact model and per-topic event
//! mappings, [`inbound`] the Kafka consumer, and [`outbound`] the Postgres
//! adapter.

pub mod domain;
pub mod inbound;
pub mod outbound;
