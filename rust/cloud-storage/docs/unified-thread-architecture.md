# Unified Thread Architecture — Research & Migration Plan

**Status:** Research / proposal — with a draft implementation of phases 1–2 on this branch (see §9)
**Scope:** Unify channel threads and comment threads into a single "message thread on any entity" abstraction; migrate existing comment threads to the channel-message shape; assess AI chat (and email) as future candidates.

---

## 1. Executive summary

**Feasibility: high.** The hard prerequisites are already in place, and the codebase has been drifting toward this design for months:

- Everything lives in **one physical Postgres database** (`macrodb`) — the `comms_db_client` / `email_db_client` / etc. crates are code-organization wrappers over the same `DATABASE_URL` (see `justfile:65-125`; the comms schema migration header says it was folded into macrodb). There is no cross-database barrier to migrating comments into `comms_messages`.
- A canonical polymorphic entity reference already exists: `model_entity::Entity { entity_type, entity_id }` (`model-entity/src/lib.rs:112`), and the codebase convention for cross-domain references is soft `(entity_type, entity_id)` varchar pairs (used by `comms_attachments`, `comms_entity_mentions`, `entity_properties`).
- A single access oracle exists: `EntityAccessService::get_access_level(user, entity_id, entity_type)` (`entity_access/src/domain/service.rs:167`).
- The notification model is already entity-generic (primary + secondary `Entity` per notification, `20260618145754_add_secondary_notification_entity.sql`); only *fanout* (recipient selection) is per-domain.
- Mentions are already fully polymorphic in **both** directions via `comms_entity_mentions(source_entity_type, source_entity_id, entity_type, entity_id)` — the "discussion = threads on entity ∪ threads mentioning entity" union is queryable today with existing indexes.
- The frontend already has the unification seam: `core/comments/discussion/` (`DiscussionSource`) renders **channel** `Message`/`Thread`/`Input` components for document discussions, CRM comments, and the PR prototype.
- A channel thread is already a first-class entity (`EntityType::ChannelMessage`, `SoupItem::ChannelThread`, `GraphqlSoupChannelThread`).

The strongest evidence this unification is *needed*: threading is currently implemented **four separate times** (channel messages, document annotations, CRM comments, email), each hard-wired to exactly one parent type. `crm_thread` (`20260527194808`) even says in its migration comment that it "mirrors the document Thread/Comment shape" — the team keeps re-implementing "thread on an entity" per domain.

The two genuinely hard parts:

1. **Everything in the channels stack is keyed on `channel_id`** — schema (`comms_messages.channel_id NOT NULL` FK), permissions (binary channel membership), realtime recipient computation, notification fanout and notification *rows* (`event_item_type='channel'`), unread tracking (`comms_activity` is channel-grained), and search indexing envelopes. Generifying the parent is mostly a methodical slog through these layers, not a research problem.
2. **Markdown comment anchors live inside per-document Loro CRDTs** (`CommentNode.__threadId` + mark ids), not in Postgres. A naive id migration would require rewriting every document's CRDT. The plan below avoids this entirely via **markId indirection** — no CRDT rewrites needed.

Recommended sequencing: (1) generify the message parent + extract a parent-generic thread service; (2) backfill document + CRM comments into `comms_messages`; (3) cut the frontend over via `DiscussionSource`; (4) separately, generify message *content* (structured parts) + adopt durable streaming in channels — which is the AI-in-channels enabler and is valuable even independently of the comment migration; (5) only then evaluate folding `ChatMessage` storage into the unified shape. **Do not unify email** (see §8).

---

## 2. Current state (what exists today)

### 2.1 Channel threads (the target shape)

Schema: `macro_db_client/migrations/20251104101012_comms_db_schema.sql`.

```
comms_messages
  id          uuid PK
  channel_id  uuid NOT NULL  FK -> comms_channels ON DELETE CASCADE
  thread_id   uuid NULL      FK -> comms_messages(id)  (self-reference)
  sender_id   text NOT NULL  (user id or "bot|<uuid>")
  content     text NOT NULL  (markdown with <m-*-mention> XML tags)
  created_at / updated_at / edited_at / deleted_at (soft delete)
  triggered_by_user_id text NULL  (human who prompted a bot message)
```

- **Threading is two-level**: a top-level message has `thread_id IS NULL`; replies carry `thread_id = <top-level message id>`. There is **no thread table** — the thread *is* the root message (`ChannelMessageKind::{TopLevelMessage, ThreadReply}`, `channels/src/domain/models.rs:104`).
- Sidecars: `comms_reactions (message_id, emoji, user_id)`, `comms_attachments (message_id, entity_type, entity_id, channel_id, width, height)` — note the attachment *target* is already polymorphic, the *source* is not.
- `comms_entity_mentions` is fully polymorphic on both source and target (no FKs; ids stored as text).
- Access: **binary channel membership** (`comms_channel_participants`), resolved by `get_channel_access` (`entity_access/src/domain/service.rs:58`). `EntityType::ChannelMessage` currently resolves to `None` — threads have no access identity of their own (`service.rs:195`).
- Sharing semantics: posting a message that references a Document/Chat/Project/EmailThread/Call grants the **channel** View access to that item (`channels/src/outbound/pg_channel_reference_share_permissions.rs`; `entity_access.source_type='channel'` rows).
- Realtime: side effects compute a **recipient user list** (channel/thread participants) and push complete `comms_message` / `comms_reaction` / `comms_attachment` / `comms_typing` events per-user through the connection gateway (`channels/src/outbound/connection_gateway_realtime.rs`). No streaming, no partial content.
- Notifications: primary entity = `Channel(channel_id)`, secondary = `ChannelMessage(thread_id)` (`channels/src/outbound/notification_sender.rs:114`); notification rows use `event_item_type='channel'`; message-delete cascade keys on that (`20260423120000`).
- Unread: `comms_activity (user_id, channel_id, viewed_at, interacted_at)` — **channel-grained**, not thread-grained.
- Search: SQS envelopes `ChannelMessageUpdate { channel_id, message_id }` (`channels/src/outbound/sqs_search_indexer.rs`).

### 2.2 Document comment threads ("annotations")

Storage: MacroDB, baseline schema (`macro_db_client/migrations/0001_baseline.sql:658-749`); API in `document_storage_service/src/api/annotations/`.

```
"Thread"   id BIGSERIAL PK, owner, "documentId" TEXT, metadata JSONB {markId},
           resolved BOOL (dormant — no write path), timestamps, soft delete
"Comment"  id BIGSERIAL PK, "threadId" BIGINT (no FK!), owner, sender (nullable),
           text TEXT (markdown), "order" (deprecated), metadata JSONB, timestamps
```

- **Flat threading**: replies are just more `Comment` rows on the same `threadId`, ordered by `order` then `createdAt`. First comment is the root; deleting the root soft-deletes the whole thread.
- **Content is already the same family as channel content**: markdown text rendered by the same `StaticMarkdown`, mentions supported via the same `<m-user-mention>` tag family plus a `mentions {users, mentionId}` side-channel on create/edit that drives notifications and public-doc access grants.
- **Anchoring — the genuinely document-specific part:**
  - *Lexical/markdown docs*: the anchor is a `CommentNode` (a Lexical `MarkNode`, `js/lexical-core/nodes/CommentNode.ts`) **embedded in the Loro CRDT document**, carrying the mark uuid (`getIDs()`) and the numeric `__threadId`. The Postgres side holds only `Thread.metadata.markId` — the mark uuid is the join key.
  - *Unanchored "Discussion" threads*: same tables, with the sentinel `markId = "DISCUSSION:<uuid>"` (`block-md/comments/discussionResource.ts:15`).
  - *PDF/DOCX*: Postgres anchor tables `ThreadAnchor` (join, keyed by BIGINT threadId) + `PdfPlaceableCommentAnchor` / `PdfHighlightAnchor` / `PdfHighlightRect` (page + percentage bounding boxes). The `DocumentInstanceModificationData.modificationData` JSONB is a **derived view** rebuilt from these tables (`macro_db_client/src/document/build_pdf_modification_data.rs`).
- No reactions, no attachments, no resolve UI (hidden), lighter composer (`MarkdownTextarea` instead of the channel `Input`).
- Realtime: connection-gateway `"comment"` events (`AnnotationIncrementalUpdate`) targeted at the **Document** entity.
- Notifications: three bespoke types (`mentioned_in_document_comment`, `replied_to_document_comment_thread`, `commented_on_document`) carrying `comment_id`/`thread_id` as **i64**, with a recipient policy of mention > thread participant > task assignee > document owner (`api/annotations/mod.rs:134-197`).

### 2.3 CRM comments (the third implementation)

`crm_thread` / `crm_comment` (`20260527194808`): uuid PKs, parent = company **or** contact via nullable FKs + `CHECK num_nonnulls(...) = 1`, no anchors, same root-delete-collapses-thread behavior. Frontend already renders it through the shared `Discussion`. This is a small, clean system that should be absorbed by the unified model almost for free.

### 2.4 Frontend

- SolidJS. Channel UI in `js/app/packages/channel/` (Message/Thread/Input namespaces, reactions, attachments, TanStack Query + comms websocket with nonce-deduped optimistic updates).
- **`core/comments/discussion/` is the existing seam**: `DiscussionSource` (normalized `DiscussionThread`/`DiscussionComment`) + `Discussion.tsx` + `DiscussionInput.tsx` render channel components for any backend. Adapters currently zero out reactions/attachments (`discussion/messageAdapter.ts`).
- Anchored margin UI (`block-md/comments/CommentMargin.tsx`, `commentPlugin.ts`, `markStore`) and PDF placement are document-specific and stay so.
- Three real-time pipelines today: comms websocket (channels, fully live), annotations websocket (document comments, partially wired), TanStack polling (CRM). Unification upgrades the latter two.

### 2.5 AI chat

- `Chat` / `ChatMessage` tables; `ChatMessage.content` is **JSONB**: `Text(String)` or `Vec<AssistantMessagePart>` (`Text | ToolCall | McpToolCall | ToolCallResponseJson | ToolCallErr | Thinking`, `agent/src/types.rs:51-141`). Sidecar `resolved_message_content` for the AI-facing resolved form.
- Streaming uses the **`stream` crate** — durable, resumable Redis Streams keyed by `StreamId { entity_type, entity_id, stream_id }` (`stream/src/domain/types.rs:6`), consumed generically by the connection gateway. **This primitive is already entity-generic**; it is simply only used with `EntityType::Chat` today.
- The channel-bot feature (`channel_bots`) demonstrates the exact gap: it posts an `<m-await>` placeholder, runs the agent loop, **discards everything except final text** (`agent_loop_responder.rs:63-67` keeps only `StreamPart::Content`), then `patch_message`es the placeholder. No streaming, no tool/thinking/citation rendering — because `comms_messages.content` is a flat string and channel realtime only carries complete events.
- Rendering/identity layers are already substantially shared: same `StaticMarkdown` + lexical node registry (themes differ), same mention plugin, `bot|<uuid>` principal + `triggered_by_user_id` provenance across both surfaces.

---

## 3. Target architecture

### 3.1 Generifying the message parent

**Recommendation: polymorphic parent columns on `comms_messages`** (Option A), not a separate thread table.

```sql
ALTER TABLE comms_messages
  ADD COLUMN parent_type varchar(32),   -- model_entity::EntityType snake_case: 'channel', 'document', 'crm_company', ...
  ADD COLUMN parent_id   varchar;       -- entity id as text (soft reference, matches comms_attachments convention)
-- backfill: parent_type='channel', parent_id=channel_id::text
-- then: SET NOT NULL, relax channel_id to NULL (keep it, denormalized, for channel-parented rows
--       so the ON DELETE CASCADE from comms_channels keeps working)
```

- Only **top-level** messages need a meaningful parent; replies inherit it, but we should still stamp `parent_type/parent_id` on replies (denormalized) so every existing `(channel_id, ...)` index has a direct `(parent_type, parent_id, ...)` replacement and queries never need a self-join.
- New indexes mirror the current ones: `(parent_type, parent_id, created_at DESC, id DESC) WHERE thread_id IS NULL`, `(thread_id, created_at DESC) WHERE deleted_at IS NULL`, etc.
- Non-channel parents get no FK (consistent with the repo-wide soft-reference convention). Deletion cleanup for entity parents goes through app logic / the existing deleted-item machinery rather than cascades.
- Why not a `threads` table (Option B): channels' "thread = root message" model is load-bearing across ~40 repo methods, soup (`SoupItem::ChannelThread` keyed by root message id), notifications (secondary entity = `ChannelMessage(thread_id)`), and the frontend. Introducing a separate thread row would churn all of it for no modeling gain — the root-message-as-thread model maps perfectly onto comment threads (root comment → top-level message).

**Thread-level extras** channels don't have get a small side table instead of widening every message row:

```sql
CREATE TABLE comms_thread_details (
  root_message_id  uuid PK REFERENCES comms_messages(id) ON DELETE CASCADE,
  resolved         boolean NOT NULL DEFAULT false,
  mark_id          text,            -- lexical anchor join key (NULL = unanchored/discussion)
  legacy_thread_id bigint,          -- old "Thread".id, for deep links / notifications / audit
  legacy_source    varchar(16)      -- 'annotation' | 'crm'
);
```

`mark_id IS NULL` **replaces the `DISCUSSION:` sentinel hack** — a discussion thread is simply an unanchored thread on the entity.

### 3.2 Extracting a parent-generic thread service

Carve `ChannelServiceImpl`'s message paths (`post_message`, replies, reactions, attachments, mentions, typing) into a `ThreadService` parameterized by parent `Entity`, with per-parent-type policy hooks for the pieces that legitimately differ:

| Concern | Channel parent | Entity parent (document/task/project/CRM/...) |
|---|---|---|
| Can view thread | channel member | `get_access_level(parent) >= View` |
| Can post | channel member | `get_access_level(parent) >= Comment` |
| Realtime recipients | channel participants | users with access to parent (`get_users_by_entity`, expanding channel/team sources) |
| Notification recipients | mention > reply > channel-message policy (existing) | mention > thread participant > task assignee > owner (existing comment policy) |
| Referenced-item sharing | grant to channel (existing) | **defer** — skip initially (see §6 open questions) |
| Unread | `comms_activity` per channel | per parent entity (generalize `comms_activity` key) — can lag the first cut |

Access wiring:
- Implement `get_access_level` for `EntityType::ChannelMessage`: resolve root message → parent entity → delegate. This makes threads real, shareable-by-reference entities (deep links, soup, notifications all already key off `ChannelMessage`).
- Replace the route-level `ChannelAccessLevelExtractor` with a parent-entity extractor for the new unified routes. Keep the existing `/channels/...` routes delegating to the same service (channel parent) so nothing breaks.

New API surface (sketch): `GET/POST /threads/{parent_type}/{parent_id}` (list/create top-level), `GET/POST .../messages/{message_id}/replies`, reactions/attachments routes parent-agnostic (they already key on message id). Existing `/annotations/comments/*` and `/crm/comments/*` become thin shims during transition, then are retired.

Cross-layer generalizations (each mechanical, none research-y):
- **Realtime**: keep `comms_message`/`comms_reaction`/`comms_attachment` event types; payload gains `parent_type/parent_id`; recipient computation goes through the generic resolver. Frontend `SyncProvider` routes by parent to channel caches *or* discussion caches.
- **Notifications**: primary entity becomes the **parent** `Entity`, secondary stays `ChannelMessage(thread_id)`. Collapse the duplicated per-domain event variants over time (`ChannelMessageReply` / `RepliedToDocumentCommentThread` → one reply-to-thread event with parent context); the delete-cascade SQL keyed on `event_item_type='channel'` needs the parent-generic equivalent.
- **Search**: generalize the SQS envelope (`ChannelMessageUpdate { channel_id }` → parent entity). Entity-parented threads can be excluded from indexing in the first cut.

### 3.3 What stays document-specific (by design)

Anchor acquisition and presentation: the `CommentNode`/`commentPlugin` mark machinery, `CommentMargin` layout, PDF rect/page anchors, and Loro sync of marks. The unified model only needs to know "this thread has `mark_id` X" (lexical) or "this thread has PDF anchor rows" — everything from the thread body upward is generic.

---

## 4. Migrating existing comments to the channel-message shape

### 4.1 The id problem, and why we don't rewrite CRDTs

Old ids are BIGSERIAL; `comms_messages` uses uuid. The numeric `__threadId` is embedded in every `CommentNode` inside every markdown document's Loro CRDT — rewriting those means loading, mutating, and re-snapshotting every document. **Avoid this entirely:**

- The mark uuid (`markId`) is *also* stored both in the CRDT (mark `ids`) and in Postgres (`Thread.metadata.markId`). Make **`mark_id` the canonical join key** frontend-side: `CommentsProvider` already marries server threads to editor marks; switch its keying from numeric threadId to markId (a small, contained frontend change). `__threadId` in old documents becomes vestigial — tolerated, never read.
- Keep `legacy_thread_id` in `comms_thread_details` for deep links (`MD_URL_PARAMS.commentId`), old notification metadata (i64 `comment_id`/`thread_id`), and audit. Add a resolve endpoint or lookup for legacy links.
- Generate new message ids as uuidv7 at backfill time (or uuidv5 from `('annotation', legacy_id)` if deterministic idempotence is preferred), and record the full mapping in a scratch table `legacy_annotation_message_map(legacy_comment_id, legacy_thread_id, message_id, root_message_id)` for verification and re-runs.

### 4.2 Row mapping

For each live `"Thread"` (with ≥1 non-deleted comment; run an orphan-cleanup pass first — there are no FKs today):

| Source | Target |
|---|---|
| First comment (by `order`, then `createdAt`) | top-level `comms_messages` row: `thread_id=NULL`, `parent_type='document'`, `parent_id=documentId`, `channel_id=NULL` |
| Remaining comments | replies: `thread_id = <root uuid>` |
| `COALESCE(sender, owner)` | `sender_id` |
| `text` | `content` (same markdown + `<m-*-mention>` family; run a backfill validator over old rows for markup drift) |
| `createdAt`/`updatedAt`/`deletedAt` | `created_at`/`updated_at`/`deleted_at`; set `edited_at = updatedAt` where `updatedAt > createdAt` |
| `Thread.resolved`, `Thread.metadata.markId` | `comms_thread_details.resolved`, `.mark_id` (`DISCUSSION:*` → `mark_id NULL`) |
| mention tags in `text` | re-parse with `mention_utils` → `comms_entity_mentions` rows (`source_entity_type='message'`) |

PDF anchors: add `thread_message_id uuid` to `ThreadAnchor` (or a parallel join), populate from the mapping, and regenerate the derived `modificationData` JSONB per affected document via the existing `build_pdf_modification_data` path pointed at the new source. Mechanical, but it is a per-document batch job, not one SQL statement.

CRM comments migrate identically (`parent_type='crm_company'|'crm_contact'`), minus anchors — this retires an entire parallel system.

### 4.3 Rollout sequence

1. **Schema + service groundwork** (§3.1–3.2) behind the existing routes; channels keep working unchanged with `parent_type='channel'` backfilled.
2. **Shim writes**: point `/annotations/comments/*` and `/crm/comments/*` handlers at the unified service (write to `comms_messages`), keeping response shapes stable. This avoids a dual-write window — the old tables simply stop growing. (If a rollback hatch is wanted, dual-write for a short window instead; volumes are modest.)
3. **Backfill** historical rows with the mapping above; verify counts, spot-check rendered content, regenerate PDF modification data.
4. **Cut reads**: `documentDiscussionSource` / `crmDiscussionSource` / `commentsResource` move to the unified thread API + `comms_message` websocket events (this is where document comments *gain* live updates, reactions, attachments — stop zeroing them in `discussion/messageAdapter.ts`). Anchored margin resolves threads by `mark_id`.
5. **Retire**: old annotation comment endpoints (keep the PDF *anchor geometry* endpoints), the annotations `"comment"` websocket path, `crm_thread`/`crm_comment`, and eventually the old `Thread`/`Comment` tables (archive first; old notification metadata still references legacy ids — resolve via `legacy_thread_id`).

### 4.4 What the migration deliberately does *not* change

- Anchor acquisition/rendering (marks, margins, PDF rects) — untouched.
- Channel behavior — `parent_type='channel'` is just the first parent type; existing routes, events, and clients are unaffected until they opt into new features.
- Email — see §8.

---

## 5. What this unlocks (validating the motivation)

- **Reactions + attachments on comment threads**: free once comments are `comms_messages` rows — `comms_reactions`/`comms_attachments` key on message id, and the frontend Discussion already renders channel components that support both.
- **Shape unification**: one thread service, one set of sidecars, one renderer; deletes the document-annotation comment path and the entire CRM comment system.
- **Unified discussion section on any entity**: `threads WHERE parent=(E)` ∪ `comms_entity_mentions WHERE entity=(E) AND source_entity_type='message'` → root messages. Both directions are already indexed (`idx_comms_entity_mentions_entity_type_id` includes the source). Permission-filter by parent access. A thread that starts in a channel and mentions a task shows up in the task's discussion — the exact "originated in a channel, continued on the task" flow. This needs one new query/endpoint + soup surfacing, not new infrastructure.
- **Bots/agents everywhere threads exist**: `bot|<uuid>` senders and `triggered_by_user_id` are message-level concepts and carry over to entity-parented threads unchanged — agents can participate in a document's discussion for free.

---

## 6. Risks and open product decisions

- **Notification/unread policy for entity threads** is a product decision: "everyone with access to the document" is too broad for realtime+unread on widely shared docs. Proposal: notify mention/participant/assignee/owner (the existing comment policy); realtime-push to whoever has the entity open (they're subscribed to the parent entity anyway); defer per-entity unread badges.
- **Referenced-item sharing**: channels grant referenced items to the channel. For a document-parented thread the analog ("grant to everyone with access to the document"?) is unclear — skip initially, revisit.
- **Deletion semantics**: comments collapse the thread when the root is deleted; channels soft-delete individual messages. Pick one behavior per parent type (policy hook) or unify on "root delete collapses" for entity threads only.
- **No DB cascade for entity parents**: document deletion must clean up its threads via app logic / deleted-item poller; add a sweep job.
- **Ordering edge cases**: legacy `order` values that contradict timestamps; preserve legacy ordering at backfill by sequencing on `(order, createdAt)` and accepting `created_at` as the go-forward sort key.
- **Legacy deep links & notification metadata** carry i64 ids — resolvable via `legacy_thread_id`, but the resolve path must ship *with* the read cutover, not after.
- **Public-doc mention grants** (`share_public_document_with_mentioned_users`) must be re-hooked into the unified mention path.
- **Two-level threading only**: fine — comment threads are flat lists, which map exactly.

---

## 7. AI chat: assessment and recommendation

**Verdict: right long-term direction, wrong first step.** Split it into two moves with very different risk profiles:

### 7.1 Do soon (independently valuable): generify message *content* + streaming in channels

The two limitations blocking good agent messages in channels are precisely: flat `content TEXT` and complete-event-only realtime. Both have ready-made answers in the codebase:

- **Structured parts**: add nullable `content_parts JSONB` to `comms_messages` (shape = `Vec<AssistantMessagePart>`, the existing `agent/src/types.rs` model — or a superset that treats today's markdown string as a single `Text` part). Plain human messages keep using `content`; agent/rich messages populate `content_parts`. The AI-chat renderer (`AssistantMessageParts.tsx` + ~40 tool renderers) becomes reusable for channel messages.
- **Streaming**: the `stream` crate is already entity-generic (`StreamId { entity_type, entity_id, stream_id }`) and already flows through the connection gateway. Back an in-flight channel/thread message with a durable stream keyed to the message id; on completion persist final parts and emit the normal `comms_message` event. This deletes the `<m-await>` placeholder + `patch_message` hack in `channel_bots`, and stops `agent_loop_responder.rs` throwing away thinking/tool parts.

This chunk doesn't depend on parent generification and pays off immediately in channels; combined with §3–4 it gives streaming agent replies inside any entity's discussion.

### 7.2 Do later (evaluate after comments ship): fold `ChatMessage` storage into unified messages

A chat then becomes a thread whose parent is the `Chat` entity (which stays — it owns model selection, token counts, `isPersistent`, project linkage, `ChatPermission` sharing, and the `resolved_message_content` chain). Mapping is plausible: assistant rows → bot sender with `content_parts`; user rows → user sender; linear (no `thread_id`). But the payoff (chat rendered as "just a thread", continue a chat anywhere) is smaller than the cost until the unified abstraction is proven: DCS's stream/save path, resolved-content chain, and chat-specific querying all rework, and chat has its own well-functioning storage today. Decide after §4 lands.

### 7.3 Email: don't unify

Email threads are an immutable provider mirror (per-inbox rows keyed by `provider_id`, one conversation = N rows across inboxes, heavy sync machinery). The right level of unification already exists: `EmailThread` is a first-class `EntityType` participating in `entity_access`, soup, and mentions — so email threads can be *parents of* and *mentioned in* unified threads (discussion on an email thread!) without their messages living in `comms_messages`. The user's instinct that this is the weakest link is correct.

---

## 8. Suggested phasing

| Phase | Work | Notes |
|---|---|---|
| 1 | Parent generification: `parent_type/parent_id` on `comms_messages` + indexes; `comms_thread_details`; extract parent-generic `ThreadService` with policy hooks; `ChannelMessage` access resolution; parent-generic realtime/notification recipient resolver; unified thread routes | Largest chunk; channels unaffected (`parent_type='channel'`) |
| 2 | Comments migration: orphan cleanup → shim writes → backfill (+ mapping table, mention re-parse, PDF anchor re-key + modificationData regen) → frontend read cutover via `DiscussionSource` → legacy resolve path for deep links/notifications | Unlocks reactions/attachments/live-updates on comments |
| 3 | CRM comments migration + retire `crm_*` comment tables; retire annotation comment endpoints and `DISCUSSION:` hack | Small |
| 4 | Discussion union view: threads-on-entity ∪ threads-mentioning-entity endpoint + soup/UI surfacing | Infrastructure already exists |
| 5 | Content parts + durable streaming for channel/thread messages; rewire `channel_bots`; share AI part renderers | Independent of 2–4; can run in parallel after 1 |
| 6 | Evaluate `ChatMessage` unification | Decision gate, not a commitment |

---

## 9. Draft implementation (phases 1–2) on this branch

What exists in code, and what deliberately does not yet.

### Implemented

**Schema** (`macro_db_client/migrations/`):
- `20260706190536_message_parent_entity.sql` — nullable `parent_type`/`parent_id` on `comms_messages` (NULL = legacy channel row), backfill, `channel_id` relaxed to NULL with a consistency CHECK, expression indexes on the `COALESCE(parent_type,'channel')` form, and the `comms_thread_details` side table (resolved, `mark_id`, legacy identity).
- `20260706190546_comment_thread_migration_scaffolding.sql` — `legacy_comment_message_map` (per-comment old→new id map) and `"ThreadAnchor"."threadMessageId"` for the PDF anchor re-key.
- The parent columns stay nullable in this draft so existing test fixtures keep working; a follow-up migration flips them NOT NULL after fixture cleanup.

**`message_threads` crate** (new, hexagonal): parent-generic `ThreadService` with `ThreadParent` (validated entity parent), post/list/get-thread/replies, resolved flag, reactions, mention mirroring into `comms_entity_mentions`, and a legacy-thread resolve. Outbound: `PgThreadsRepo` (all reads use the COALESCE parent form), `EntityAccessRecipientResolver` (audience = `get_users_by_entity`), `ConnectionGatewayThreadRealtimePublisher` (`thread_message` / `thread_reaction` events, parent-tagged, per-user fan-out like channels). Inbound: `/message_threads/{entity_type}/{entity_id}[...]` routes authorized against the parent via `EntityPermissionExtractor` — View (or channel membership) to read, Comment (or membership) to write.

**Access resolution** (`entity_access`): `EntityType::ChannelMessage` now resolves by delegating to the message's parent entity (`get_message_thread_parent` repo query + `get_channel_message_access` in the service), in both `get_access_level` and `get_entity_permission`. Threads are now real, addressable entities.

**Channel write paths** now stamp `parent_type='channel'`/`parent_id` on insert (`pg_channels_repo::create_message`, `comms_db_client` `create_message`/`seed_message`).

**`backfill_comment_threads` binary** (modeled on `backfill_entity_access`): idempotent, keyset-batched phases — annotation roots → annotation replies → CRM roots → CRM replies → PDF anchor re-key → mention re-parse into `comms_entity_mentions`. Mention extraction is a deliberately tolerant per-tag scan rather than `mention_utils::ParsedXmlText`, because the strict parser fails the whole text on one malformed legacy payload (smoke-tested: that silently dropped valid mentions). `verify` prints source-vs-migrated counts. Legacy tables are never written. Verified end-to-end against seeded legacy data locally. One correction to §2.2 discovered while seeding: today's schema **does** have FKs on `"Thread"`/`"Comment"` (owner → `"User"`, documentId → `"Document"`, threadId → `"Thread"`), so the pre-backfill orphan problem is smaller than the research suggested.

### Deliberately not in this draft

- **Notification fan-out for entity threads** — the audience resolver exists, but the per-parent notification *policy* (mention > participant > assignee > owner) is a product decision; the service carries a TODO where dispatch belongs.
- **Shim writes from the legacy endpoints** — pointing `/annotations/comments/*` and `/crm/comments/*` at the unified service requires either allocating legacy numeric ids (dual-write) or landing the frontend cutover simultaneously, because the legacy response shapes expose BIGSERIAL ids. Decision needed; see §4.3 step 2.
- **Frontend cutover** — `DiscussionSource` adapters onto `/message_threads` + `thread_message` websocket routing in `SyncProvider`.
- **Message edit/delete on the unified routes**, unread activity, search indexing for entity threads, and converging `channels` message paths onto `ThreadService`.
- **PDF `modificationData` regeneration** — mechanical once reads cut over (`build_pdf_modification_data` keeps reading legacy tables until then).

## Appendix: key files

**Channels**: `channels/src/domain/{models,service,side_effects,ports}.rs`, `channels/src/outbound/{pg_channels_repo,connection_gateway_realtime,notification_sender,pg_channel_reference_share_permissions,sqs_search_indexer}.rs`, `macro_db_client/migrations/20251104101012_comms_db_schema.sql`
**Annotations**: `model/src/annotations/`, `document_storage_service/src/api/annotations/`, `macro_db_client/src/annotations/`, `macro_db_client/src/document/build_pdf_modification_data.rs`, `macro_db_client/migrations/0001_baseline.sql:658-749`
**CRM comments**: `crm/src/domain/comment.rs`, `crm/src/inbound/axum_router/comments.rs`, `macro_db_client/migrations/20260527194808_create_crm_comments.sql`
**Access**: `entity_access/src/domain/service.rs`, `entity_access_management/`, `entity_access_db_utils/`, `macro_db_client/migrations/20260331152752_add_entity_access_table.sql`
**Notifications**: `notification/src/domain/service/ingress.rs`, `model_notifications/src/metadata.rs`, `macro_db_client/migrations/20260618145754_add_secondary_notification_entity.sql`
**AI**: `chat/`, `agent/src/{types,stream,convert}.rs`, `stream/src/`, `channel_bots/src/`, `document_cognition_service/src/api/stream/chat_message/mod.rs`
**Frontend**: `js/app/packages/channel/`, `js/app/packages/core/comments/` (incl. `discussion/`), `js/app/packages/block-md/comments/`, `js/app/packages/block-pdf/store/comments/`, `js/lexical-core/nodes/CommentNode.ts`, `js/app/packages/core/component/LexicalMarkdown/plugins/comments/commentPlugin.ts`, `js/app/packages/queries/channel/`
