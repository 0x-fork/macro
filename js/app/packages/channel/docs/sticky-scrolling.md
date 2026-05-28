# Sticky Scrolling

"Sticky Scrolling" in channels is a mechanism that should keep the content relating to the bottom-most (no remaining pagination) of a channel in view.

The following are cases where sticky scrolling should be applied.

1. I am at the bottom of a channel (approximately) within some threshold. I receive a new message, either from myself or from another user, that message should be in view. To accomplish this we need to scroll down to the newest message.
2. I am at the bottom of a channel, I or anyone else in the channel react to the latest message, I should be scrolled slightly so that reaction is in view.
3. I am at the bottom of a channel, I hit "reply" on the latest message. The entirety of the reply input box should be visible to me.

## Initial scroll on open

When a channel opens it should _appear_ already pinned to its initial target —
the bottom for a normal open, or a specific message for a deep link.

The list is virtualized (TanStack Virtual) and only knows an _estimated_ row
height (`BASE_ITEM_SIZE`) until each row is actually measured. Real rows
(markdown, attachments, thread replies, images that load in) are taller, so a
naive `scrollToIndex(last)` lands short of the true bottom; as rows are then
measured the content grows and — without intervention — the newest message is
pushed below the fold, which is the "renders mid-list, then jumps to the
bottom" flicker. It correlated with cache state because warm reopens measure
rows in the same frame while cold opens measure later.

`ThreadList` solves this with TanStack Virtual's **end anchoring**
(`anchorTo: 'end'`):

- The virtualizer is anchored to the end of the list. After the on-mount
  `scrollToEnd()`, any row growth from measurement applies a compensating
  scroll adjustment, so the bottom stays pinned instead of being left behind at
  the estimated offset. There is no scroll-then-correct for the user to see.
- The same anchoring holds the viewport steady when older pages are prepended
  (this is what the old `shift` prop did) and keeps the tail of the last
  message in view when it grows (covering the reaction / reply-box cases above).

Live new-message stickiness (case 1) is still driven by `createStickyScrollEffect`,
because it must _not_ follow appends while there are newer pages left to load
(e.g. while paging down from a deep link) — a distinction `anchorTo` alone
cannot make.
