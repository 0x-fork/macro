#![deny(missing_docs)]

//! Channel bots: trigger built-in bot behavior from channel events.
//!
//! Channels emit [`ChannelBotTrigger`](channels::domain::side_effects::ChannelBotTrigger)s
//! when a user message mentions one or more bots. The inbound
//! [`BotTriggerRouter`](inbound::BotTriggerRouter) resolves each mentioned
//! system bot and runs the appropriate domain service:
//!
//! * **System bots** (defined inside Macro) run in-process. Both Macro AI
//!   (`@macro`) and the TaskAgent shorthand (`@taskagent`) are handled by
//!   [`MacroAiHandler`](domain::service::MacroAiHandler), which posts an
//!   immediate "thinking" message, runs the agent loop, then edits the message
//!   with the answer. `@taskagent` layers canned task-creation instructions
//!   onto the prompt; its replies are still posted as the Macro bot.

/// Domain layer: bot trigger models, ports, and service implementation.
pub mod domain;
/// Inbound adapters for channel bot triggers.
pub mod inbound;
/// Outbound adapters for channel bot dependencies.
pub mod outbound;
