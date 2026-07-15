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
generic row implementation based on the active view. Remaining TODOs cover
active facet chips, dynamic assignee/company filters, the Search facet row,
shared entity actions, Companies board mode, and mobile-specific controls.
