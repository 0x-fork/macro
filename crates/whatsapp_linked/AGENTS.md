# whatsapp_linked

## What it is

External chats and their one provider, personal WhatsApp accounts linked as
devices: owner-bound pairing, adding an existing group or direct chat as the
adder's own, independently shared `ExternalChat` entity (one per owner,
provider and remote chat, named after WhatsApp), ingesting chat traffic, and
deliberate sends from each person's own account. The crate holds both the
provider-neutral domain (timeline, read state, sharing, sends, uploads,
notification effects, `/external-chats` routes) and the WhatsApp provider
(pairing, roster, chat list, JIDs, ingest, dispatch, `/whatsapp` routes).
Internal names such as `Binding` (an added chat) and `GroupFacts` predate the
split. `Binding.kind` / `external_chat.kind` says group or direct (only the
owner sends in a direct chat). DSS serves the HTTP API (`/external-chats/*`,
`/whatsapp/*`); the WhatsApp session service calls
`domain::session::SessionService` in-process. They share no HTTP: only MacroDB
rows and `NOTIFY` (the `outbound::pg` notify helper).

## Start here

- `src/domain/service.rs`: DSS use cases and send eligibility.
- `src/domain/session.rs` + `src/domain/events.rs`: the session-service API and
  its event types (no whatsmeow types).
- `src/domain/effects.rs`: notification outbox drained by DSS.
- `src/outbound/pg/ingest.rs`: canonical identity `(binding, person, source id)`,
  quarantine, deferral and the standalone message write. Senders are resolved
  first (`resolve_sender_in`): WhatsApp's from-me flag means the account's own
  identity; a LID-only sender takes its phone number from the account's roster
  pair. Only what is still LID-only is quarantined.
- `src/domain/rich.rs`: stored structured content (`RichContent`: poll, poll
  vote, location, contact cards, event, system line) in
  `external_chat_message.rich`; `kind = 'system'` rows never notify or count
  as unread. `src/domain/timeline/view.rs` resolves ids in mentions, system
  lines and votes to names and tallies polls. Poll votes are stored per voter
  in `external_chat_poll_vote` through the reaction path of `reserve_in`. A
  re-ingested message fills in `rich`/`mentions`/`forwarded` an earlier copy
  lacked (re-importing history upgrades old placeholders).
- `src/outbound/pg/chats.rs`: the account's chat list (`whatsapp_chat`,
  `GET /whatsapp/chats` via `LinkedService::chats`) and importing earlier messages of
  added chats (`backfill_*` columns on `external_chat`; limits
  `BACKFILL_MESSAGE_LIMIT` / `BACKFILL_MAX_AGE_DAYS` in `models.rs`). The
  anchor is the chat's `whatsapp_chat.anchor`, else the newest stored message
  the account saw; without one the group is `waiting_for_message` until a chat
  update brings one. History
  messages skip the adoption-time boundary but only reach the account owner's
  own groups (`observed_bindings_in`).
- `src/outbound/pg/sends.rs`: enqueue, claim, dispatch fence, outcome. A
  repeated intent key returns the stored send before any other check.
- `src/signals.rs`: `NOTIFY` channels and JSON payloads with `traceparent`
  (`src/signals/trace_context.rs`), public so DSS and the session service
  never import `outbound`; `src/outbound/pg.rs` sends them inside the
  writing transaction. Every write a page shows calls
  `notify_change` (`external_chat_changed`); DSS pushes it to viewers. Roster writes
  signal only real changes (`groups.rs` `same_facts`).
- Migrations:
  `crates/macro_db_client/migrations/20261027061310_whatsapp_linked.sql` (the
  first schema, with its entity type validation), then
  `20261027194950_whatsapp_attachments_as_static_files.sql` (attachments keep a
  static `file_id`), then `*_external_chat.sql` (the generic `external_chat*`
  tables, the view rule `external_chat_access_level` that entity_access also
  calls, and `whatsapp_roster`/`whatsapp_chat_membership`; released files
  queue in `external_chat_file_deletion`) and its entity type validation.
  Deleting a user cascades to their account,
  chats (with their grants, entity record and sharing settings) and sends;
  aliases outlive the account that saw them.
## Boundaries

- Depends on: `entity_access` (group receipts; owner-only routes take an owner receipt), `entity_access_db_utils`
  (ordinary grants), `entity_registry_db_utils`, and `share_permission_db_utils`.
- Used by: DSS (`src/external_chat.rs` composition), the session service.

## Checks

- `cargo test -p whatsapp_linked --all-features` (`SQLX_OFFLINE` unset).
- Check `--no-default-features --features ports` and `inbound` independently; domain dependencies must be enabled by `ports`, not only by the Postgres adapter.

## Gotchas

- Only the connection owner sends or uploads, using their session or own API credential; bot/harness/internal principals never send. Pairing reads and account/access controls require a human session. Preserve verified Macro API JWT origin even without agent attribution.
- Deliberate sends consume a shared per-user request budget (one per second across all groups and DSS replicas); DSS supplies the Redis-backed `SendRateLimiter`. Exhaustion returns HTTP 429 with `Retry-After: 1`; counter failure fails closed.
- Lock accounts before groups, then child rows; lock every group in a batch in UUID order. Pairing expiry locks affected accounts before pairing rows. Media completion takes the group lock before attachment/message writes.
- Every session-service write takes the account row lock at the caller's
  `lease_epoch`; `LinkedError::Fenced` means stop the account now.
- `dispatch_started_at` is written before submission. A dispatched send without
  an outcome becomes `unknown` on takeover and is never resent; a later echo
  with its `allocated_source_id` settles it.
- Bot view receipts can read a known shared group, but never borrow an acting user's phone, send records, or unread cursor.
- View access uses ordinary `entity_access` grants (people, teams, and channels
  through mentions) and link/team sharing, independent of WhatsApp membership;
  `external_chat_can_view` and entity_access both call `external_chat_access_level`; change the rule only there. Only the adopter receives an owner grant; use the generic
  direct-access endpoints to share with people.
- `src/domain/timeline.rs` and `src/domain/service/timeline.rs` own list/detail,
  timeline, unread and sharing use cases. Chat HTTP paths are
  `/external-chats/{chat_id}`; queries look chats up by `(provider,
  remote_id)`. Soup/search are deferred.
- Store messages/reactions/attachments/poll votes in `external_chat_message`,
  `external_chat_reaction`, `external_chat_attachment` and
  `external_chat_poll_vote`; never native comms tables.
- Attachment bytes cross Postgres (`external_chat_media_blob`, ≤ 32 MiB) because the
  session service has no file storage; DSS stores them as static files (like
  Chat's media, readable by id) through the `FileStore` port and deletes the
  blob. A file no attachment references is queued in `external_chat_file_deletion`
  (trigger) and deleted by `MediaService::delete_released`.
  `events::Media::locator` is sealed by the session service; never read it.
- `src/domain/media.rs` + `src/outbound/pg/media.rs`: download claims, import
  queue. `src/domain/shape.rs` reads a staged upload's pixel size and length
  (stored on `external_chat_media_blob`, sent with the message). Not implemented:
  participant-receipt UI.

## Related

- Docs: `docs/architecture/external-chats.md`, `docs/architecture/whatsapp-linked-devices.md` · Rules: `.agents/rules/observability.md`
