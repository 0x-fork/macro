# Soup view

`SoupView` is currently one concrete full-frame component. Header, toolbar,
item-kind rendering, per-view entity rows, keyboard navigation, selection,
pull-to-refresh, preview, and notification invalidation intentionally remain
together while the replacement behavior settles. They can be split later.

```tsx
<SoupView
  view="inbox"
  viewName="Inbox"
  state={listState}
  loading={<Loading />}
  empty={<Empty />}
  isNewInbox
  onActivate={openItem}
  onNavigate={openNavigatedItem}
  pullIndicator={(pull) => <InboxPullIndicator state={pull} />}
/>
```

The collection owns a facet selection plus data state and emits conventional
entity, group-header, and load-more items. Facets compile directly to the Soup
backend AST and Search service filters; the replacement does not use the legacy
query/predicate stores. View/tab baseline facets live in
`soup-view-presets.ts`, while the Soup facet engine and catalog live under
`features/soup-list/`.

`SoupView` renders the items itself and selects the Inbox, Task, Company, or
generic row implementation based on the active view. The isolated view includes
active facet chips, dynamic assignee/company/tag filters, gated type-specific
Search controls, Mail inbox selection, specialized headers/empty states,
reactive flat transport, a Company board and saved-view controls, and mobile
navigation/filter/create controls, long-press selection, and swipe actions.
The replacement also owns mark-done, rename, property/tag, favorite, copy,
delete, context-menu, hotkey, selection-toolbar, and file/folder-drop behavior.
Remaining parity work is concentrated in replacement-owned row-tag
interaction and deeper mounted end-to-end coverage.
