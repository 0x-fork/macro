# JS App Performance Audit

Comprehensive analysis of the SolidJS app identifying bottlenecks in data flow,
rendering, bundle loading, and reactivity.

---

## Architecture Data Flow Overview

```
App Boot
  index.tsx → initializeLexical() (EAGER - pulls all Lexical nodes)
  ↓
  Root.tsx → 8 nested context providers
    EntityProvider → UserContextProvider → GlobalAppStateProvider
    → ChannelsContextProvider → QuickAccessProvider → SearchProvider
  ↓
  allBlocks.ts → import.meta.glob('../../block-*/definition.ts', { eager: true })
    → Pulls ALL block definitions + their full dependency trees at startup
    → Includes: CodeMirror core, loro-crdt WASM, markdown/channel/email/PDF component code
  ↓
  Layout.tsx → SplitLayout → SplitPanel(s)
    Each panel: createSoupState() + VList (virtualized)
    ↓
    Per row: <EntityRow> → <ListEntity>
      → Renders BOTH NarrowLayout AND WideLayout (CSS @container toggle)
      → Each row: StaticMarkdown → creates/parses Lexical editor state TWICE
      → Each row: DisplayName → spawns per-instance createEffect on global queue
```

---

## Critical Bottlenecks (Ranked by Impact)

### 1. CRITICAL: Eager glob loads ALL block definitions at startup

**File:** `packages/core/constant/allBlocks.ts:16-23`

```ts
export const blocks = Object.fromEntries(
  Object.values<AnyBlockDefinition>(
    import.meta.glob('../../block-*/definition.ts', {
      eager: true,       // ← THIS pulls every block's entire module graph
      import: 'definition',
    })
  ).map((definition) => [definition.name, definition])
);
```

**Impact:** This single pattern is the #1 bundle size problem. It eagerly imports:
- `block-md/definition.ts` → `createLoroManager` → `loro-crdt` (WASM CRDT library)
- `block-code/definition.ts` → `BlockCode` → CodeMirror core (~100KB+ gzipped)
- `block-channel/definition.ts` → `ChannelBlock` + channel queries
- `block-email/definition.ts` → email component tree
- `block-canvas/definition.ts` → canvas renderer
- `block-pdf/definition.ts` → PDF component code (pdfjs-dist itself is lazy)
- All other block packages

All of this is loaded **before the user sees anything**, regardless of whether they
ever open a code file, PDF, or canvas.

**Fix:** Change `eager: true` to `eager: false`. This returns lazy `() => import(...)`
functions instead. Block definitions can be resolved on-demand when a block type is
first needed. The `allBlocks.ts` lookup maps would become async or use a lazy
registry pattern. Only `definition.ts` metadata (name, accepted mimetypes) needs to
be eager - the `component` and `load` function can be lazy.

---

### 2. CRITICAL: StaticMarkdown parses every instance TWICE

**File:** `packages/core/component/LexicalMarkdown/component/core/StaticMarkdown.tsx:805-831`

```ts
// Effect 1: synchronous parse
createEffect(() => {
  setEditorStateFromMarkdown(editor, props.markdown, props.target);
  setEditorState(editor.getEditorState());
});

// Effect 2: async citation replacement → re-parses the SAME markdown
createEffect(() => {
  replaceCitations(props.markdown).then((content) => {
    setEditorStateFromMarkdown(editor, content, props.target);  // second parse!
    setEditorState(editor.getEditorState());
  });
});
```

**Impact:** Every `StaticMarkdown` instance parses its content twice - once synchronously
and once asynchronously (even if there are no citations to replace). `StaticMarkdown`
is used in **every entity row** in the unified list (soup view), every channel message
preview, every email snippet, and every search result. In a list of 50 visible items,
that's 100 Lexical parse operations.

**Fix:**
- Combine into a single effect: check for citations first, parse once with the final content
- Skip the citation pass entirely when no citation markers are present in the markdown
- Consider: if `replaceCitations` returns the same string (no citations), skip the second
  `setEditorStateFromMarkdown` entirely

---

### 3. HIGH: ListEntity renders BOTH layouts simultaneously

**File:** `packages/entity/src/composed/ListEntity.tsx:437-438`

```tsx
<NarrowLayout {...layoutProps()} />
<WideLayout {...layoutProps()} />
```

Every entity row renders **two complete layout trees** (narrow and wide), hiding one
with CSS `@container` queries (`@lg/entity:hidden` / `hidden @lg/entity:grid`). Each
layout contains `Entity.Icon`, `Entity.Title`, `Switch/Match` blocks, `StaticMarkdown`,
timestamps, badges, etc.

**Impact:** Every row in the virtualized list pays 2x the component instantiation,
signal creation, and DOM node cost. In a list showing 30 visible rows, that's 60
layout component trees alive at once.

**Fix:** Use a reactive signal for the container width breakpoint (via ResizeObserver
on the container) and conditionally render only one layout with `<Show>` or `<Match>`:

```tsx
<Show when={isWide()} fallback={<NarrowLayout {...layoutProps()} />}>
  <WideLayout {...layoutProps()} />
</Show>
```

---

### 4. HIGH: Per-user createEffect duplication in displayName.ts

**File:** `packages/core/user/displayName.ts:114-119`

```ts
function useUserNameItem(id: MacroId) {
  // ...
  createEffect(() => {
    const queue = displayNameFetchQueue();
    if (queue.length > 0) {
      processFetchQueue();
    }
  });
```

**Impact:** Every call to `useUserNameItem` (which powers `useDisplayName` and
`useDisplayNameParts`) creates a **new effect** watching the same global
`displayNameFetchQueue` signal. If 50 user names are displayed (e.g., in a channel
message list), 50 identical effects all fire every time ANY name is queued for fetch.
Each effect triggers the same debounced `processFetchQueue()`.

**Fix:** Move the effect to a single module-level `createRoot` (same pattern already
used correctly in `profilePicture.ts` and `unfurl.ts`):

```ts
createRoot(() =>
  createEffect(() => {
    const queue = displayNameFetchQueue();
    if (queue.length > 0) { processFetchQueue(); }
  })
);
```

Then remove the `createEffect` from inside `useUserNameItem`.

---

### 5. HIGH: EmojiSelector renders ~1,800 buttons without virtualization

**File:** `packages/core/component/Emoji/EmojiSelector.tsx:143-184`

Nested `<For each={groups}>` → `<For each={group.emojis}>` renders all emoji groups
and all emojis as `<button>` elements simultaneously. Standard emoji datasets contain
~1,800+ emojis.

Additionally, `packages/core/component/Emoji/emojis.ts:1-5` eagerly imports
`emojilib`, `fuse.js`, and two JSON datasets from `unicode-emoji-json` at module load
time, building search indexes synchronously.

**Impact:** Opening the emoji picker creates ~1,800 DOM buttons at once, and the emoji
data/Fuse.js index is built on module import (which happens at app startup because the
emoji module is reachable from the eagerly-loaded Lexical system).

**Fix:**
- Add virtualization to the emoji grid (use `VList` or a virtual grid)
- Lazy-load the emoji data module so it's only imported when the picker opens
- Consider rendering only the first visible group initially, then render more on scroll

---

### 6. HIGH: Subscription leak in collab manager

**File:** `packages/core/collab/manager.ts:505-514`

```ts
createEffect(() => {
  if (mirror()) {
    mirror()?.subscribe((update, metadata) => {
      setState(() => ({ state: update, metadata }));
    });
  }
});
```

**Impact:** Every time `mirror()` changes, a new subscription is created but the previous
one is never cleaned up. Over time this accumulates listeners that all fire on every
update, causing redundant state updates and memory leaks.

Same pattern in `packages/core/collab/engine.ts:226`:
```ts
createEffect(() => {
  if (!running()) return;
  source.listen(async (event) => { ... });
});
```

**Fix:** Add `onCleanup` to dispose the previous subscription:

```ts
createEffect(() => {
  const m = mirror();
  if (m) {
    const unsub = m.subscribe((update, metadata) => {
      setState(() => ({ state: update, metadata }));
    });
    onCleanup(() => unsub());
  }
});
```

---

### 7. HIGH: Email previews make N individual API requests instead of batch

**File:** `packages/queries/preview/fetchers.ts:184-224`

```ts
async function fetchEmailPreviews(threadIds: string[]): Promise<PreviewItem[]> {
  const results = await Promise.all(
    threadIds.map(async (threadId) => {
      const result = await emailClient.getThread({  // 1 request per thread!
        thread_id: threadId, offset: 0, limit: 1,
      });
    })
  );
}
```

**Impact:** Every other entity type (documents, channels, chats, projects) uses batch
endpoints (e.g., `getBatchDocumentPreviews`). Email previews fire N individual HTTP
requests for N threads. With 50 emails visible, that's 50 parallel requests that can
saturate the browser's connection limit (~6 per host) and cause request queuing.

**Fix:** Add a batch email preview endpoint (like the other entity types) or at minimum
implement client-side batching with a sliding window to limit concurrent requests.

---

### 8. HIGH: initializeLexical() runs synchronously at app startup

**File:** `packages/app/index.tsx:31` (approx) + `packages/lexical-core/index.ts`

`initializeLexical()` is called at the top of `index.tsx`, which imports from
`@lexical-core` - a barrel file with **36 `export *` statements** re-exporting every
Lexical node type, all transformers, decorator registry, constants, and utilities.

**Impact:** The entire Lexical editor system (all node types, plugins, transformers)
is loaded and initialized before the user sees anything. This is unnecessary for
routes that don't display any rich text (e.g., login, settings, project list).

**Fix:** Defer `initializeLexical()` to when the first Lexical editor or
`StaticMarkdown` is actually rendered. Use a lazy initialization pattern that
runs once on first use.

---

### 9. MEDIUM: Wholesale store replacement invalidates all subscribers

**Files:**
- `packages/core/signal/profilePicture.ts:95`
- `packages/core/user/displayName.ts:93`
- `packages/core/signal/unfurl.ts:74,84,107`

```ts
setUserDisplayNames((prev) => ({ ...prev, ...updates }));
```

**Impact:** Spreading creates a new top-level object, causing every subscriber of every
key to re-evaluate. The correct pattern (granular key update) is already used elsewhere
in these same files.

**Fix:** Use granular path-based updates:
```ts
for (const [id, value] of Object.entries(updates)) {
  setUserDisplayNames(id, value);
}
```

---

### 10. MEDIUM: Entity properties query has staleTime: 0

**File:** `packages/queries/properties/entity.ts:61`

```ts
staleTime: 0,
```

**Impact:** Entity properties refetch on every component mount. Every time a user
navigates between items, the properties panel fires a network request even if the data
hasn't changed. Mutations already invalidate this query on success.

**Fix:** Raise to 60 seconds or match the 5-minute default. The mutation `onSettled`
handlers already call `invalidatePropertiesForEntity()`.

---

### 11. MEDIUM: invalidateAllSoup() on email draft save

**File:** `packages/queries/email/draft.ts:45`

```ts
onSuccess() {
  queryClient.invalidateQueries({ queryKey: emailKeys.previews._def });
  invalidateAllSoup();  // invalidates ALL soup list queries across all views
},
```

**Impact:** Saving a draft invalidates every soup query in every open panel/tab,
triggering refetches of all pagination pages.

**Fix:** Use targeted `invalidateSoupEntity(draftId)` instead of blanket invalidation.

---

### 12. MEDIUM: LiveIndicators uses `.splice()` instead of `.slice()`

**File:** `packages/core/component/LiveIndicators.tsx:43`

```tsx
<For each={userIds().splice(0, 3)}>
```

**Impact:** `Array.splice` **mutates** the source array and returns removed elements.
This should be `.slice(0, 3)`. While the practical rendering impact is small (only 3
items), it mutates the underlying reactive array on every render, which can cause
cascading reactivity issues.

**Fix:** Change `.splice(0, 3)` to `.slice(0, 3)`.

---

### 13. MEDIUM: Props destructuring breaks SolidJS reactivity

**Files:**
- `packages/block-channel/component/Message/MessageContainer.tsx:132`: `const { message } = props;`
- `packages/block-channel/component/MarkdownArea.tsx:193`: `const { editor, plugins, cleanup } = props.lexicalWrapper;`
- `packages/core/component/AI/component/input/useChatMarkdownArea.tsx:239`
- `packages/core/component/LexicalMarkdown/component/misc/MentionsTextarea.tsx:58`
- `packages/core/component/LexicalMarkdown/plugins/mentions/mentionsPlugin.ts:291`
- `packages/block-md/component/MediaSelector.tsx:61`

**Impact:** In SolidJS, destructuring props eagerly captures values at destructure-time.
If the parent provides a new value, the component won't react to the change. This is
especially dangerous in `MessageContainer` where `message` objects can be updated in
real-time (edits, reactions). It also affects the `Block` component
(`packages/core/block.ts:426-430`) which captures `props.id`, `props.name`, etc. into
a signal's initial value.

**Fix:** Always access props via `props.message`, `props.lexicalWrapper.editor`, etc.
Use `splitProps()` or `mergeProps()` for derived values.

---

### 14. MEDIUM: entityById memo uses incorrect equality function

**File:** `packages/app/component/next-soup/soup-view/soup-view.tsx:439-454`

```ts
createMemo(() => { /* builds Map<string, SoupRow> */ }, {
  equals(prev, next) {
    return prev.size === next.size;  // only compares size!
  },
});
```

**Impact:** If the list is filtered/sorted to a different set of items with the same
count, the memo returns stale data because only `.size` is compared.

**Fix:** Compare entries, or use a hash of the IDs, or rely on SolidJS's default
reference equality (which would correctly detect a new Map instance).

---

### 15. LOW-MEDIUM: Module-level createEffect without owner

**File:** `packages/core/signal/tabFocus.ts:11-20`

```ts
createEffect(() => {
  window.addEventListener('focus', maybeSetFocus);
  // ...
  onCleanup(() => {
    window.removeEventListener('focus', maybeSetFocus);  // dead code!
  });
});
```

**Impact:** Module-level `createEffect` runs outside any reactive owner, so `onCleanup`
never fires. The listeners persist forever. Compare with `profilePicture.ts` and
`unfurl.ts` which correctly use `createRoot(...)`.

**Fix:** Wrap in `createRoot()` for consistency, or just register listeners directly
without the effect/cleanup indirection (since they're truly global singletons).

---

### 16. LOW-MEDIUM: refetchOnWindowFocus: 'always' on email queries

**Files:**
- `packages/queries/email/label.ts:15`
- `packages/queries/email/link.ts:14`

```ts
refetchOnWindowFocus: 'always',
```

**Impact:** `'always'` refetches on every tab switch even when data is fresh. The global
default wisely uses `false`.

**Fix:** Change to `true` (respects staleTime) or remove (inherits global `false`).

---

### 17. LOW: Optimistic notification insert immediately invalidated

**File:** `packages/queries/notification/user-notifications.ts:390-415`

After optimistically inserting a notification into cache, `invalidateUserNotifications()`
is immediately called, triggering a full refetch that overwrites the optimistic data.

**Fix:** Either trust the optimistic insert (remove the invalidation) or skip the
optimistic insert (just invalidate). Don't do both.

---

## Summary: Optimization Priority Matrix

| # | Issue | Category | Effort | Impact |
|---|-------|----------|--------|--------|
| 1 | Lazy-load block definitions (remove `eager: true`) | Bundle | Medium | Very High |
| 2 | StaticMarkdown double-parse | Rendering | Low | Very High |
| 3 | ListEntity dual-layout rendering | Rendering | Low | High |
| 4 | displayName per-instance effects | Reactivity | Low | High |
| 5 | EmojiSelector virtualization | Rendering | Medium | High |
| 6 | Collab manager subscription leak | Memory | Low | High |
| 7 | Email preview batch API | Network | Medium | High |
| 8 | Defer initializeLexical() | Bundle | Medium | High |
| 9 | Granular store updates | Reactivity | Low | Medium |
| 10 | Entity properties staleTime: 0 | Network | Trivial | Medium |
| 11 | Targeted soup invalidation | Network | Low | Medium |
| 12 | splice → slice bug fix | Correctness | Trivial | Medium |
| 13 | Props destructuring fixes | Reactivity | Medium | Medium |
| 14 | entityById equality fix | Correctness | Trivial | Medium |
| 15 | tabFocus createRoot wrapper | Correctivity | Trivial | Low |
| 16 | Remove refetchOnWindowFocus: 'always' | Network | Trivial | Low |
| 17 | Notification double-invalidation | Network | Trivial | Low |

### Quick Wins (< 30 min each, high value):
- #12: `.splice` → `.slice` (one character fix)
- #10: `staleTime: 0` → `staleTime: 60_000`
- #4: Move createEffect to module-level createRoot
- #9: Granular store updates in profilePicture/displayName/unfurl
- #2: Skip citation pass when no citations in markdown
- #14: Fix entityById equality function

### Medium Effort, High Payoff:
- #1: Lazy block definitions (biggest single improvement to initial load)
- #3: Single-layout rendering per row
- #6: Add onCleanup to collab subscriptions
- #8: Defer Lexical initialization

### Larger Projects:
- #5: Virtualized emoji picker
- #7: Batch email preview API endpoint
- #13: Systematic props destructuring audit
