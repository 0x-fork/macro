//! Domain models for channel bot triggers.

use channels::domain::models::MutatedMessage;
use macro_user_id::user_id::MacroUserIdStr;
use uuid::Uuid;

/// The kind of event that triggered a bot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BotTrigger {
    /// The bot was `@`-mentioned in a channel message.
    Mention,
}

/// Which system-bot persona a mention targeted.
///
/// Every persona replies as the Macro bot; they differ only in the behavior
/// instructions layered onto the prompt built for the mention.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BotPersona {
    /// The general-purpose Macro assistant (`@macro`).
    MacroAi,
    /// Task-creation shorthand (`@taskagent`): create a task from the
    /// triggering message and assign it to the correct person.
    TaskAgent,
}

/// A normalized trigger delivered to a system bot handler.
#[derive(Debug, Clone)]
pub struct BotEvent {
    /// What triggered the bot.
    pub trigger: BotTrigger,
    /// Which persona was mentioned.
    pub persona: BotPersona,
    /// Channel the trigger occurred in.
    pub channel_id: Uuid,
    /// The user-authored message that triggered the bot.
    pub message: MutatedMessage,
    /// Thread the bot should reply in. For a top-level message this is the
    /// message id; for a reply it is the existing thread id.
    pub reply_thread_id: Uuid,
    /// The user who triggered the bot.
    pub requesting_user: MacroUserIdStr<'static>,
}
