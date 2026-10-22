//! What a viewer may do with an event, following Google's guest permissions.

use serde::{Deserialize, Serialize};

use super::models::{ActorInboxes, CalendarAttendee, CalendarEvent, EventStatus};

/// The switches an organizer sets on an event to bound what its guests may
/// do. Google omits a switch from the payload while it holds its default.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "ai_tools", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub struct GuestPolicy {
    /// Whether guests may change the event, including its guest list.
    pub can_modify: bool,
    /// Whether guests may invite others.
    pub can_invite_others: bool,
    /// Whether guests may see the guest list.
    pub can_see_other_guests: bool,
}

impl Default for GuestPolicy {
    /// Google's defaults: no modifying, inviting allowed, guest list visible.
    fn default() -> Self {
        Self {
            can_modify: false,
            can_invite_others: true,
            can_see_other_guests: true,
        }
    }
}

impl GuestPolicy {
    /// Whether this is Google's default policy. Kept out of serialized
    /// projections so projections stored before the policy was modeled still
    /// compare equal to fresh ones.
    pub fn is_default(&self) -> bool {
        *self == Self::default()
    }
}

/// The facts about one copy of an event that decide what an actor may do
/// with it.
#[derive(Clone, Copy, Debug)]
pub struct EventAccess<'a> {
    /// Whether the copy's calendar prohibits editing it.
    pub is_read_only: bool,
    /// The organizer's email.
    pub organizer_email: Option<&'a str>,
    /// The guest list the actor's relation is read from.
    pub attendees: &'a [CalendarAttendee],
    /// What the organizer lets guests do.
    pub guest_policy: GuestPolicy,
}

/// What the viewing requester may do with an event.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "ai_tools", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub struct ViewerCapabilities {
    /// Change the event's details (title, time, description, conference).
    pub edit_details: bool,
    /// Add guests.
    pub invite_guests: bool,
    /// Remove guests.
    pub remove_guests: bool,
    /// Change the event's guest policy.
    pub set_guest_policy: bool,
    /// Answer the invitation.
    pub rsvp: bool,
}

impl ViewerCapabilities {
    /// No capability at all.
    pub const NONE: Self = Self {
        edit_details: false,
        invite_guests: false,
        remove_guests: false,
        set_guest_policy: false,
        rsvp: false,
    };

    /// Whether the viewer may do nothing with the event.
    pub fn is_none(&self) -> bool {
        *self == Self::NONE
    }

    /// Resolve what `actor` may do with `event`.
    ///
    /// A read-only or cancelled event allows nothing. The organizer may do
    /// everything, and so may anyone on a writable event without attendees,
    /// which is treated as the actor's own. A guest's rights follow the
    /// event's [`GuestPolicy`]: modify allows everything except changing the
    /// policy, invite allows adding guests, and every guest may answer. A
    /// guest may change the guest list only while it is visible: Google takes
    /// guest additions as a whole new list, and a guest's copy of a hidden
    /// list holds only themselves and the organizer.
    /// Anyone else, including a teammate or channel member looking at someone
    /// else's projection, may do nothing. Answering always needs the actor's
    /// own attendee row, since that is the row the answer is written to.
    pub fn for_event(event: &CalendarEvent, actor: &ActorInboxes) -> Self {
        if event.status == EventStatus::Cancelled {
            return Self::NONE;
        }
        Self::for_access(
            EventAccess {
                is_read_only: event.is_read_only,
                organizer_email: event.organizer_email.as_deref(),
                attendees: &event.attendees,
                guest_policy: event.guest_policy,
            },
            actor,
        )
    }

    /// Resolve what `actor` may do with a live copy of an event; see
    /// [`Self::for_event`].
    pub fn for_access(access: EventAccess<'_>, actor: &ActorInboxes) -> Self {
        if access.is_read_only {
            return Self::NONE;
        }
        let is_guest = access
            .attendees
            .iter()
            .any(|attendee| actor.matches(&attendee.email));
        let is_organizer = access
            .organizer_email
            .is_some_and(|email| actor.matches(email))
            || access
                .attendees
                .iter()
                .any(|attendee| attendee.is_organizer && actor.matches(&attendee.email));
        if is_organizer || access.attendees.is_empty() {
            return Self {
                edit_details: true,
                invite_guests: true,
                remove_guests: true,
                set_guest_policy: true,
                rsvp: is_guest,
            };
        }
        if !is_guest {
            return Self::NONE;
        }
        let policy = access.guest_policy;
        Self {
            edit_details: policy.can_modify,
            invite_guests: policy.can_see_other_guests
                && (policy.can_modify || policy.can_invite_others),
            remove_guests: policy.can_see_other_guests && policy.can_modify,
            set_guest_policy: false,
            rsvp: true,
        }
    }
}

#[cfg(test)]
mod test;
