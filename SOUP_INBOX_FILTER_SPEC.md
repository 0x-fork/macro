# Soup Inbox Backend Filtering Spec

## Problem
The Inbox (`signal`) view is currently filtered on the frontend after fetching soup pages.  
This causes pagination/perf issues because we do not know when matching entities are exhausted.

Goal: push Inbox-relevant filtering into backend soup queries so pagination is accurate and finite.

## Inbox Rules (Source Of Truth)
- Channel: in Inbox when it has at least one notification with `done = false`.
- Email: in Inbox when marked important (already handled; do not change email inbox behavior now).
- Chat: in Inbox when it has at least one notification with `done = false`.
- Document: in Inbox when it has at least one notification with `done = false`.
- Task (document subtype): in Inbox when:
  - it has at least one notification with `done = false`, OR
  - it is created by me, assigned to me, and status is not completed.

## Filter Contract Changes

### 1) Per-entity `notification_filters`
Add to each entity filter block:

```ts
notification_filters: {
  done?: boolean; // true | false | undefined
  seen?: boolean; // true | false | undefined
}
```

Attach to:
- `document_filters`
- `project_filters`
- `chat_filters`
- `channel_filters`
- `email_filters` (schema-compatible, no behavior change needed right now)

Semantics:
- `true`: require at least one notification row for that entity/user where the field is true.
- `false`: require at least one notification row for that entity/user where the field is false.
- `undefined`: no constraint for that field.

### 2) Document-scoped `task_filters`
Add under `document_filters` only:

```ts
task_filters: {
  include_cbm_atm_nc?: boolean; // true | false | undefined
}
```

`include_cbm_atm_nc = true` means:
- if entity is a task document, return it when:
  - `Document.owner == current_user`
  - assignees contains current_user
  - task status != completed
- and this path is OR-ed with normal document filter logic, so it can bypass other document filter criteria.

## Detailed Implementation Plan

### Phase 1: Data Model + AST + API Schema
Files:
- `rust/cloud-storage/item_filters/src/lib.rs`
- `rust/cloud-storage/item_filters/src/ast/document.rs`
- `rust/cloud-storage/item_filters/src/ast/chat.rs`
- `rust/cloud-storage/item_filters/src/ast/project.rs`
- `rust/cloud-storage/item_filters/src/ast/channel.rs`
- `rust/cloud-storage/item_filters/src/ast/email.rs`
- `rust/cloud-storage/item_filters/src/ast/tests.rs`

Changes:
- Add `NotificationFilters` struct (`done`, `seen`).
- Add `TaskFilters` struct (`include_cbm_atm_nc`).
- Add `notification_filters` field to all entity filter structs.
- Add `task_filters` to `DocumentFilters`.
- Extend AST literal enums with notification/task variants where applicable.
- Ensure `ExpandFrame` impls include new fields and `IsEmpty` remains correct.

### Phase 2: Expanded Soup SQL (docs/chats/projects)
File:
- `rust/cloud-storage/soup/src/outbound/pg_soup_repo/expanded/dynamic.rs`

Changes:
- Add SQL builders for notification predicates using `EXISTS` over `notification` + `user_notification`:
  - join keys: `n.event_item_id = <entity_id>::text`, `n.event_item_type = <entity_type>`
  - user scope: `un.user_id = $1`, `un.deleted_at IS NULL`
- Apply done/seen notification filters per entity clause (document/chat/project).
- For documents, add `include_cbm_atm_nc` OR clause:
  - task subtype check
  - owner == `$1`
  - assignees property contains `$1`
  - status property is missing or not equal to completed UUID
- Keep cursor + ordering behavior unchanged.

### Phase 3: Channels (Comms Query Path)
Files:
- `rust/cloud-storage/comms/src/outbound/postgres/comms_repo/dynamic.rs`
- `rust/cloud-storage/comms/src/outbound/postgres/comms_repo/dynamic/tests.rs`

Changes:
- Extend channel filter AST handling with notification done/seen literals.
- Add `EXISTS` notification filter predicates at channel query level.
- Preserve current channel type/org/channel id filtering behavior.

### Phase 4: Frecency Path Parity
File:
- `rust/cloud-storage/frecency/src/outbound/postgres/dynamic.rs`

Changes:
- Mirror notification/task literal handling used in soup dynamic SQL.
- Ensure frecency-sorted soup (`sort_method=frecency`) respects same backend filter semantics.

### Phase 5: Frontend Query Construction
Context:
- `js/app/packages/app/component/next-soup/filters/index.ts` is only re-exports.
- Query shaping is driven by `filters.ts`, `soup-toolbar.tsx`, and `soup-view-context.tsx`.

Files:
- `js/app/packages/app/component/next-soup/filters/filters.ts`
- `js/app/packages/app/component/next-soup/soup-view/soup-toolbar.tsx`
- `js/app/packages/app/component/next-soup/soup-view/soup-view-context.tsx`

Changes:
- Add helper(s) to compose backend Inbox filters from active focus/not-done/unread state.
- When Inbox/not-done is active, send:
  - `document/chat/project/channel.notification_filters.done = false`
  - `document.task_filters.include_cbm_atm_nc = true` (Inbox path)
- When unread is active, send:
  - `document/chat/project/channel.notification_filters.seen = false`
- Merge these with existing entity-type `QUERY_FILTERS` without clobbering type constraints.
- Keep existing frontend predicates initially for safe rollout; backend reduces page volume.

### Phase 6: Client Schema Regeneration
Files (generated):
- `js/app/packages/service-clients/service-storage/generated/schemas/*`

Changes:
- Regenerate storage client after Rust schema updates so `SoupItemsQueryFilters` includes new fields.

### Phase 7: Test Matrix
Add/extend tests for:
- `item_filters` AST expansion of new fields.
- soup request parsing (`axum_router` tests) for `notification_filters` + `task_filters`.
- expanded soup dynamic filtering:
  - done false
  - seen false
  - done+seen combined
  - `include_cbm_atm_nc` OR behavior bypassing other document constraints
- comms dynamic channel notification filtering.
- frecency dynamic path with same filters.
- frontend helper that maps active filters -> soup request body.

## SQL Shape Notes
Use `EXISTS` predicates instead of broad joins to avoid row explosion and to keep top-N pagination stable.

Example done=false predicate:

```sql
EXISTS (
  SELECT 1
  FROM notification n
  JOIN user_notification un ON un.notification_id = n.id
  WHERE un.user_id = $1
    AND un.deleted_at IS NULL
    AND n.event_item_type = 'document'
    AND n.event_item_id = d.id::text
    AND un.done = false
)
```

## Rollout
- Ship backend + frontend under a feature flag if needed.
- Validate first-page fill rate and cursor exhaustion behavior in Inbox.
- After confidence, keep frontend predicates only as defensive fallback or remove redundant local filtering.
