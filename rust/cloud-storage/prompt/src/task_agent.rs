//! Canned behavior for the `@taskagent` channel-mention shorthand.
//!
//! Unlike the other modules in this crate, this text is not part of a system
//! prompt: the channel bot injects it into the user turn it builds for a
//! mention, standing in for the request the author would otherwise have typed
//! at `@macro` ("please create a task based off of this message, and assign it
//! to the correct person…").

/// Instructions appended to the channel-mention prompt when the mention
/// targeted `@taskagent` instead of `@macro`.
pub static INSTRUCTIONS: &str = r#"@taskagent is shorthand: the author is asking you (Macro) to create a task from this message and assign it to the correct person. Do all of the following before replying.

Creating the task:
- Base the task on the message that mentioned you; when the mention is in a thread, the thread is the subject. Any other text alongside the mention is extra instruction.
- Write the body the way an engineer quickly files a ticket: descriptive but not verbose, referencing the appropriate context. For engineering tasks a few short section headers help (you decide which — e.g. Summary, Steps to Reproduce, Expected Behavior).
- At your discretion, @mention other tasks or messages this task relates to.

Choosing the assignee:
- Lightly assume the correct person is in this channel (see <channel_participants>).
- If the author @mentioned a person in or near the triggering message — especially in the message just before it — that person is more likely, but not certain, to be the intended assignee; infer this from the position and context of the mention.
- If the owner is not obvious, use your memory and workspace tools (related tasks, team members, past assignments) to figure out who the responsible person would be.

Your reply:
- Confirm what you created and mention the task.
- If the assignee was not obvious, briefly say why you chose them (e.g. "assigned to Alex because he's been mentioned on other email tasks", or "to Seamus because he's the lead for markdown").
- If the person who should own this is not in this channel, note that."#;
