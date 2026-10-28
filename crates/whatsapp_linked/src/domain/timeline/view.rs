//! How stored rich content, mentions and votes read in the timeline: WhatsApp
//! ids become people's names, votes become tallies.

use super::*;
use crate::domain::rich::{Event, Location, PollOption, RichContent, SystemLine, web_link};
use std::collections::HashMap;

#[cfg(test)]
mod test;

/// Who WhatsApp ids are, as far as the group knows: people seen in it (with
/// their verified Macro user) and the roster's names.
#[derive(Debug, Default)]
pub struct People {
    by_jid: HashMap<String, ExternalChatPersonRef>,
}

impl People {
    /// Learn a person's name; the first name given for an id wins, so pass
    /// the better sources first.
    pub fn learn(&mut self, jid: &str, person: ExternalChatPersonRef) {
        self.by_jid.entry(jid.to_owned()).or_insert(person);
    }

    /// The person behind an id: their name when known, else their phone
    /// number, else a generic name.
    pub fn get(&self, jid: &str) -> ExternalChatPersonRef {
        if let Some(person) = self.by_jid.get(jid) {
            return person.clone();
        }
        ExternalChatPersonRef {
            name: crate::domain::jid::phone_number(jid)
                .unwrap_or_else(|| UNKNOWN_PERSON.to_owned()),
            user_id: None,
        }
    }
}

/// Name for someone WhatsApp only knows by a private id.
pub const UNKNOWN_PERSON: &str = "WhatsApp participant";

/// One person's current vote on a poll.
#[derive(Debug, Clone)]
pub struct StoredVote {
    /// The poll message.
    pub message_id: Uuid,
    /// Hashes of the options chosen.
    pub selected: Vec<String>,
    /// Who voted.
    pub voter: ExternalChatPersonRef,
}

/// The mentions of a body, by name.
pub fn mentions_view(mentions: &[String], people: &People) -> Vec<ExternalChatMention> {
    mentions
        .iter()
        .filter_map(|jid| {
            let (token, _) = jid.split_once('@')?;
            Some(ExternalChatMention {
                token: token.to_owned(),
                person: people.get(jid),
            })
        })
        .collect()
}

fn poll_option(option: &PollOption, votes: &[&StoredVote], viewer: &str) -> ExternalChatPollOption {
    let voters: Vec<ExternalChatPersonRef> = votes
        .iter()
        .filter(|vote| vote.selected.contains(&option.hash))
        .map(|vote| vote.voter.clone())
        .collect();
    ExternalChatPollOption {
        name: option.name.clone(),
        votes: voters.len() as i64,
        mine: voters
            .iter()
            .any(|voter| voter.user_id.as_deref() == Some(viewer)),
        voters,
    }
}

fn system_view(
    line: SystemLine,
    sender: &ExternalChatPersonRef,
    people: &People,
) -> ExternalChatSystemLine {
    ExternalChatSystemLine {
        action: line.action,
        actor: (!line.by_whatsapp).then(|| sender.clone()),
        participants: line
            .participants
            .iter()
            .map(|jid| people.get(jid))
            .collect(),
        value: line.value,
        call: line.call,
    }
}

/// The timeline form of stored rich content. `votes` are the votes on this
/// message; `viewer` decides `mine`.
pub fn rich_view(
    rich: RichContent,
    sender: &ExternalChatPersonRef,
    votes: &[&StoredVote],
    viewer: &str,
    people: &People,
) -> Option<ExternalChatRichContent> {
    Some(match rich {
        RichContent::Poll(poll) => ExternalChatRichContent::Poll(ExternalChatPoll {
            options: poll
                .options
                .iter()
                .map(|option| poll_option(option, votes, viewer))
                .collect(),
            question: poll.question,
            selectable_count: poll.selectable_count,
            voters: votes
                .iter()
                .filter(|vote| !vote.selected.is_empty())
                .count() as i64,
        }),
        // Links were sender-supplied; ones stored before they were checked
        // are checked again.
        RichContent::Location(location) => ExternalChatRichContent::Location(Location {
            url: location.url.as_deref().and_then(web_link),
            ..location
        }),
        RichContent::Contacts(contacts) => ExternalChatRichContent::Contacts(contacts),
        RichContent::Event(event) => ExternalChatRichContent::Event(Event {
            join_link: event.join_link.as_deref().and_then(web_link),
            ..event
        }),
        RichContent::System(line) => {
            ExternalChatRichContent::System(system_view(line, sender, people))
        }
        // Votes are applied to their poll, never shown on their own.
        RichContent::PollVote(_) => return None,
    })
}
