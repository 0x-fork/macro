# Sticky Scrolling

"Sticky Scrolling" in channels is a mechanism that should keep the content relating to the bottom-most (no remaining pagination) of a channel in view.

The following are cases where sticky scrolling should be applied.

1. I am at the bottom of a channel (approximately) within some threshold. I receive a new message, either from myself or from another user, that message should be in view. To accomplish this we need to scroll down to the newest message.
2. I am at the bottom of a channel, I or anyone else in the channel react to the latest message, I should be scrolled slightly so that reaction is in view.
3. I am at the bottom of a channel, I hit "reply" on the latest message. The entirety of the reply input box should be visible to me.

## Initial scroll on open

When a channel opens it should _appear_ already pinned to its initial target —
the bottom for a normal open, or a specific message for a deep link. Getting
there is not a single operation: the list is virtualized (`virtua`) and only
knows an _estimated_ row height (`BASE_ITEM_SIZE`) until each row is actually
measured. Real rows (markdown, attachments, thread replies, images that load
in) are taller, so the first `scrollToIndex` lands short of the true target and
the position keeps moving as rows are measured.

If the list were visible during this, the user would see it render partway up
and then jump to the bottom (worse on a cold open, where content is not cached
and measures later — hence the flicker feeling "random").

`ThreadList` handles this by:

- Keeping the scroll container **hidden** (`opacity: 0`, the layout/measurement
  still happens) until the initial scroll has settled (`didInitialScroll`).
- Running a short, time-bounded **settle loop** that re-pins to the target each
  animation frame and only completes once the position is within tolerance _and_
  the measured `scrollSize` has stabilized across frames. The stability check is
  what prevents revealing against a still-estimated size.

The net effect: the convergence happens off-screen and the user's first view of
the channel is already at the correct position.
