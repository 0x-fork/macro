# Designing a collaborative text editor (CRDTs, Durable Objects)

<!--
DRAFT for Teo to edit. Written 2026-06-09.

How to read this draft:
- Everything outside <guess> blocks is verified against the codebase as of v2026.4.28.0
  (file paths + line numbers cited inline as code comments where useful).
- Everything inside <guess>...</guess> is plausible fiction written to be fact-checked:
  dates, timelines, bug post-mortems, team details, "Wolf", the Loro collaboration story,
  cost numbers, and all "would we do it again" opinions. Rewrite or delete freely.
- Media placeholders are marked [SCREENSHOT], [GIF], [DIAGRAM], [VIDEO].
- GitHub links assume the public repo is github.com/macro-inc/macro with default branch
  `main` — verify paths resolve before publishing.

Alt titles to consider:
- "Two years of building a collaborative text editor (CRDTs, Durable Objects, and two scary bugs)"
- "Everything that broke while we built multiplayer markdown on Loro and Durable Objects"
- "We put a CRDT in a Durable Object and dogfooded it for two years"
-->

Every doc, task description, meeting note, and agent instruction in [Macro](https://macro.com) runs through the same collaborative text editor. We built it ourselves: [Lexical](https://lexical.dev) on the frontend, [Loro](https://loro.dev) CRDTs in the middle, and a ~4,000-line Rust sync service compiled to WASM running on Cloudflare Durable Objects — one Durable Object per document.

The whole thing is open source ([AGPL, in our monorepo](https://github.com/macro-inc/macro)). This post is the honest version of how it got built: the architecture, the migration we had to do mid-flight, the disconnect bug that haunted us for months, the data-loss bug that still makes us flinch, and whether — knowing everything we know now — we'd make the same choices again.

[VIDEO: 60–90s screen recording — two cursors editing the same doc, one goes offline (toggle network in devtools), keeps typing, reconnects, merges cleanly. This is the single most convincing artifact for this audience.]

## Why build this at all?

Fair question. Tiptap, ProseMirror + Yjs, Liveblocks, and Firepad all exist. Off-the-shelf collaborative editing is a solved problem if your requirements are normal.

Ours weren't, in three specific ways:

1. **The editor isn't a feature, it's the substrate.** In Macro the same markdown surface is a standalone doc, a task description, a channel message draft, a comment, and the instruction set for an AI agent. We needed one node schema, one mention system, and one permissions model across all of them — including custom inline nodes that reference users, contacts, companies, other documents, and dates, with live previews. Every off-the-shelf editor lets you add custom nodes; none of them want your custom nodes to be the *point*.

2. **We run the same parser everywhere.** Our backend needs to read documents too — for search indexing, for AI context, for export. With a third-party editor cloud, your server-side view of the document is whatever their API gives you. We instead run *headless Lexical in a Cloudflare Worker* (`js/lexical-service`) and the Rust backend calls it over HTTP. One parser, one set of ~120 markdown transformers, zero drift between what you see and what the agent reads.

3. **Permissions are ours.** Document access in Macro flows from the same system that governs email, channels, and CRM records. The sync server validates a JWT minted by our document storage service and enforces access levels (view / comment / edit / owner) *per WebSocket message* — an edit from a viewer token gets dropped on the server, not the client. Wiring that into someone else's collab cloud is possible, but you end up maintaining a mapping between two permission systems forever.

<guess>There was also a fourth reason, less rational: we'd been burned. An early prototype on a popular editor framework collapsed under our custom node types — every upgrade broke serialization in a new way, and we were patching internals within a month. At that point you're maintaining a fork of someone else's editor with none of the control, which is the worst quadrant.</guess>

### Why Lexical and not ProseMirror/tiptap?

Tiptap is a (very good) wrapper around ProseMirror, and ProseMirror's collab story pushes you toward Yjs. We went with Lexical (currently 0.32.1) for reasons that have mostly held up:

- **Headless mode is first-class.** `@lexical/headless` lets us run the exact same editor — same nodes, same transformers — server-side in a Worker. This single property shaped our whole backend architecture (more below).
- **The EditorState is a serializable double-buffered tree.** You get an immutable snapshot of the document on every update, which is exactly what you want when your sync layer works by diffing states.
- **No built-in collab opinion.** Lexical ships a Yjs binding, but the core is unopinionated about sync. Since we wanted Loro, starting from a framework that *didn't* assume Yjs meant fighting fewer defaults.

Have we malded about Lexical? Constantly. <guess>It's a 0.x project that ships breaking changes like it's a hobby, the reconciler has selection edge cases that only show up with IME and Safari, and the docs assume you're building a comment box, not a document system. We maintain a small pile of patches and workarounds, and at least twice a quarter someone proposes rewriting on ProseMirror in a fit of rage.</guess> Would we still pick it? <guess>Yes — narrowly. Headless parity between client and server is worth all of it, and the node API has let two engineers maintain ~30,000 lines of editor plugins without drowning. But if Lexical didn't have headless mode, this would be a ProseMirror shop.</guess>

### Why Loro and not Yjs/Automerge?

<guess>We evaluated Yjs, Automerge, and Loro in early 2024. Yjs is the default choice and probably the safe one — battle-tested, huge ecosystem. But Loro won on three things: it's Rust-native (which mattered because our sync server is Rust compiled to WASM, so client and server run the *same* CRDT implementation — loro-crdt 1.5.9 on the client, the loro crate 1.5.6 on the server); its tree/movable-list support matched a block editor's needs better than stitching Yjs types together; and its snapshot format with shallow exports gave us cheap "send the new client a compact snapshot" semantics. Automerge we loved conceptually and benchmarked out — at the time, document sizes and import times weren't where we needed them.</guess>

## The architecture

[DIAGRAM: render this properly for the post]

```
        Browser (SolidJS)                      Cloudflare                    Backend (AWS)
┌──────────────────────────────┐    ┌──────────────────────────────┐   ┌─────────────────────┐
│  Lexical EditorState         │    │  sync-service (Rust→WASM)    │   │ documents service   │
│   ▲│ serialize/reconcile     │    │  ┌────────────────────────┐  │   │ (metadata, perms,   │
│   │▼                         │    │  │ Durable Object per doc │  │   │  JWT minting)       │
│  loro-mirror (state↔CRDT)    │    │  │  - LoroDoc in memory   │  │   └────────┬────────────┘
│   ▲│ diff                    │    │  │  - 5s alarm: persist   │  │            │ initialize /
│   │▼                         │◄───┼─►│  - op log in DO KV     │  │◄───────────┘ backfill
│  LoroDoc (loro-crdt WASM)    │ ws │  │  - snapshots: DO SQLite│  │   ┌─────────────────────┐
│   bebop binary protocol      │    │  │    (1.5MB chunks)→KV→R2│  │   │ lexical-service     │
│                              │    │  └────────────────────────┘  │   │ (headless Lexical,  │
│  EphemeralStore (presence)   │    │   D1: peer→user mapping      │   │  md ⇄ snapshot)     │
└──────────────────────────────┘    └──────────────────────────────┘   └─────────────────────┘
```

A document's life looks like this:

1. The client opens a WebSocket to `/document/:id/connect?token=<jwt>`. The Cloudflare Worker routes it to that document's **Durable Object** — created on demand, globally unique, holding the live `LoroDoc` in memory.
2. The DO replies with `RemoteInitialSync`: a snapshot of the document plus current presence state. Wire format is [bebop](https://bebop.sh), a compact binary serialization — the schema is six message types from the server (`RemoteInitialSync`, `RemoteUpdate`, `RemoteAwareness`, `RemoteSnapshot`, `RemoteUpdateAck`, `RemoteUpdateSince`) and five from the client (`PeerUpdate`, `PeerAwareness`, `PeerRequestSince`, `PeerRequestSnapshot`, `PeerRegisterId`).
3. Local edits go through **loro-mirror**, which diffs the new Lexical state against the CRDT and emits minimal Loro operations. Updates are sent as opaque bytes; the DO merges them into its in-memory doc and broadcasts to every other connection.
4. Persistence is decoupled from the hot path. Each incoming update is appended immediately to an **operation log** in Durable Object KV; a **5-second alarm** acts as a debounced checkpoint that exports a fresh Loro snapshot, persists it, and clears the applied ops. Snapshots land in DO-attached SQLite (chunked at 1.5 MB per row to respect platform limits), with Workers KV and R2 as fallback tiers.

The Durable Object model is doing a lot of work for us here. "One single-threaded actor per document, addressable from anywhere, with strongly-consistent attached storage" is *exactly* the shape of the collaborative-document problem. We never wrote a line of room-routing, locking, or leader-election code.

The annoying part: DOs evict in-memory state after ~10 seconds of inactivity — even with open WebSockets, if no messages flow. Importing a Loro snapshot is the expensive operation we're trying to amortize, so eviction while users have the doc open is poison. Our fix is unglamorous: the same 5-second alarm that checkpoints state also functions as a heartbeat that keeps the object warm while connections exist. It works, it costs almost nothing, and it has the distinct smell of every Cloudflare-adjacent system: a clever platform primitive, plus one weird trick to defeat its lifecycle policy.

There's also a small D1 table mapping Loro peer IDs to user IDs (clients register via `PeerRegisterId`), which is what lets us attribute edits and presence to humans, and a hook that pings our search-indexing service when the last peer disconnects — so a doc gets re-indexed right after an editing session ends, not on a cron.

Code, if you want to read along:
- Sync server: [`rust/sync-service`](https://github.com/macro-inc/macro/tree/main/rust/sync-service) (~4,000 LOC of Rust)
- State↔CRDT mirror: [`js/loro-mirror`](https://github.com/macro-inc/macro/tree/main/js/loro-mirror)
- Editor nodes & transformers: [`js/lexical-core`](https://github.com/macro-inc/macro/tree/main/js/lexical-core)
- Headless parser service: [`js/lexical-service`](https://github.com/macro-inc/macro/tree/main/js/lexical-service)
- Editor UI: [`js/app/packages/block-md`](https://github.com/macro-inc/macro/tree/main/js/app/packages/block-md)

## The data model (or: the BFS conversation)

The most contested design decision was the shape of the document inside the CRDT.

The source of truth on the client is the Lexical EditorState. We mirror it into a Loro document with this schema (`js/lexical-core/markdown-loro-schema.ts`): the root is a `LoroMap`; every node is a map with `$` (a `LoroMap` of metadata — stable node ID, type, formatting), `text` (a `LoroText` for leaf text nodes, so character-level concurrent edits merge properly), and `children` (a `LoroMovableList` of child nodes). A recursive tree of CRDT containers that structurally mirrors the editor's tree.

On every Lexical update, loro-mirror diffs new state against old and emits operations. Children diff by stable node ID, and reorders are computed with a longest-increasing-subsequence pass so that dragging a block emits *move* operations on the `LoroMovableList` rather than delete+insert pairs — which is the difference between two people reordering a list concurrently getting a sane merge versus duplicated blocks.

<guess>"BFS" became the internal shorthand for this whole approach — reconcile the tree level-by-level, breadth-first, top-down: diff the root's children, then each changed node's children, and so on. We argued about it for weeks, and we still bring it up every time it causes pain (deep trees make worst-case diffs expensive; structural moves *between* parents are the ugliest code path in the mirror).</guess>

The alternatives we considered, seriously:

- **One big `LoroText` holding the markdown string.** Beautifully simple, trivially compatible with every markdown tool on earth. But concurrent *structural* edits become text merges: two people each adding a row to the same table can merge into syntactically broken markdown. Character-level merge semantics are wrong for block-level operations. Rejected.
- **A flat list of blocks with fractional ordering keys** (the Figma-style approach). Great for block reordering, but markdown isn't flat — lists nest, quotes contain lists contain code blocks — so you end up re-encoding the tree in parent-pointers and reconstructing it constantly. Rejected, mostly.
- **Loro's native `LoroTree`.** It exists for exactly this. <guess>When we started, the tree container was younger than the rest of Loro and we couldn't get cursor stability and ordering semantics we trusted out of it; we chose composing maps/lists/text ourselves so that every behavior was code we could read. With where Loro is today, this is the decision we'd most seriously revisit.</guess>

Do we still think the mirrored-tree approach was right? <guess>Yes, with one regret. Right: merge semantics match user intent (text merges at character level, structure merges at block level), and the mirror gave us a clean seam between "editor concerns" and "sync concerns" — we've never had to teach Lexical anything about CRDTs. The regret: we underestimated how much of the complexity budget the mirror itself would consume. It's the most subtle code in the system, and almost every collaborative bug we've shipped lived in the diff/reconcile layer, not in Loro and not in the server.</guess>

## From "online and shared" to "collaborative": the stages

We didn't start with CRDTs. The editor went through distinct eras:

<guess>**Era 1 — markdown blobs (mid-2023 → mid-2024).** Documents were markdown strings stored as S3 objects behind our document storage service ("DSS" internally). Online, shared, permissioned — but single-player. Saves were whole-file PUTs on a debounce. Two people editing meant last-write-wins, which we "mitigated" with soft warnings about someone else having the doc open. For a small team dogfooding, this was genuinely fine for months — and it let us ship the editor experience (nodes, mentions, slash menu) before touching distributed systems.</guess>

<guess>**Era 2 — CRDTs for new documents (late 2024).** The sync service went up on Durable Objects and newly created docs got Loro state from day one. Old docs stayed on S3. This was the right way to de-risk it — but it meant every code path grew a fork: is this a "sync doc" or a "legacy doc"?</guess>

<guess>**Era 3 — the migration (early 2025).** Backfill every legacy doc into the sync service, then delete the fork in every code path.</guess>

**Era 4 — now.** Everything collaborative rides the same rails: docs, canvas, and PDF markup all sync through the same Durable Object service; task descriptions and agent instructions are the same markdown surface; comments and presence are layered on the same connection.

The migration era left fossils you can still find in the repo. There's a complete backfill orchestrator (`rust/cloud-storage/documents/src/domain/markdown_backfill.rs`) that walks legacy documents through a lifecycle: check whether the doc already exists in the sync service → if not, read the markdown from S3 → convert it to a Loro snapshot → initialize the Durable Object → flip a `ready / sync_service` flag in the database. It has dry-run modes (`WouldInitialize` / `WouldUpdate`), an `--apply` flag, and a `--concurrency N` option, because nobody runs a one-way migration of every user's documents at full speed on the first try. And our search pipeline still carries a comment reading "markdown parsing from DSS is deprecated" next to a fallback path for stragglers.

Why migrate at all, instead of letting old docs stay markdown-on-S3 forever? Because the fork was the cost. Every feature — comments anchored to text ranges, mentions with live previews, version history, search indexing, AI reading your doc — had to be built twice or gated. <guess>The actual trigger was comments: anchoring a comment thread to a text range in a file that gets atomically replaced on every save is a losing game. We wanted stable node IDs and a real version history, and only the CRDT representation had them. Once one load-bearing feature required sync-service, keeping two systems alive was strictly worse than a scary one-time migration.</guess>

## The disconnect bug (why did that take so long?)

Every realtime system has one bug that becomes a personality trait. Ours was the disconnect bug.

The symptom: <guess>a document would silently go stale. No error, no broken UI — the editor looked perfectly healthy, you kept typing, and your edits were quietly not reaching anyone, or theirs weren't reaching you. Usually after a laptop sleep, a network blip, or a long lunch. Users (i.e., us — see dogfooding, below) would notice minutes later when a teammate said "I don't see your changes." For something like five months we'd fix a cause, declare victory, and have it resurface through a different hole.</guess>

Why it took so long, honestly:

1. **Silent failure modes compound.** A WebSocket can be dead without either side knowing — that's just TCP. The fix is heartbeats, but heartbeats interact with everything else: <guess>our first heartbeat implementation would kill the connection *during* slow initial syncs, because a multi-megabyte snapshot import on the main thread delayed the pong past the timeout. So the cure created a new strain of the disease: now *large* documents disconnected *more*.</guess> You can still read the scar tissue in the client today — the heartbeat is configured with `autoStart: false` and a comment: *"Start heartbeat manually after initial sync completes… prevents the heartbeat from closing the connection during slow initial syncs"* (`js/app/packages/service-clients/service-sync/source.ts:96`).
2. **Reconnecting is not resuming.** Early versions tried to be clever: reconnect and resume the update stream. Every clever variant had a window where an update broadcast during the gap was lost forever — connected, live, and permanently missing one edit until the next full snapshot. The current code is deliberately dumb: on every reconnect the server sends a complete fresh snapshot and presence state, the client re-imports it, and CRDT idempotency makes re-applying anything you already had a no-op. We also re-mint the auth token on every reconnect (`source.ts:62`), because long-lived tabs outlive JWTs — <guess>expired-token-on-reconnect was, embarrassingly, one of the five root causes wearing the same symptom as a trench coat.</guess>
3. **You can't reproduce "my laptop slept through a train tunnel" in a unit test.** <guess>What finally killed it was instrumentation, not insight: we put a visible connection status into the editor chrome, logged every state transition with causes, and started treating "stale but green" as a paged incident. Each root cause was obvious *once you could see it*. The lesson we took: in distributed UI, observability of connection state is a feature requirement, not a debugging aid.</guess>

Even now the client wears its paranoia openly: reconnect with constant 500 ms backoff up to 20 retries, 10-second heartbeat interval with a 5-second timeout and two missed pings allowed, restart the heartbeat after every reconnect "regardless of sync success/failure", and a status pill that tells you you're disconnected instead of pretending (`block-md/component/CollabStatus.tsx`).

[SCREENSHOT: the CollabStatus disconnected banner — "You are currently disconnected. Check your connection and refresh the page."]

## The data-loss bug

The disconnect bug was annoying. This one was scary.

<guess>For roughly two weeks in early 2025, a specific interleaving could eat edits. The sketch: the Durable Object checkpoints by exporting a snapshot, persisting it, then clearing the operation log it had applied. Under memory pressure, a DO could get evicted between accepting updates and the alarm firing — and on one path, the recovery read a snapshot that was *staler* than the op log we had just trimmed against. The doc came back missing the last seconds of typing. Worse than a crash: silent, partial, and only under load, which means dogfooding found it before customers did but only barely. One of us lost a half-written design doc paragraph mid-meeting and watched it vanish on refresh. That feeling — "the editor ate my words" — is the single worst thing a text editor can do to a person. We stopped feature work for a week.</guess>

<guess>The fix came in layers, all of which are still in the code:</guess> the op log is written *before* anything else touches the update (every incoming update is durably appended under an `o/` prefix with timestamp-ordered keys the moment it arrives); a *second* append-only copy of every operation is kept under an `a/` prefix — effectively a full audit trail whose only job is "no byte is ever unrecoverable"; the version vector of the last snapshot is stored alongside it so a stale snapshot is *detected* rather than trusted; and there are internal `debug_dump_operations` endpoints so a human can exhume the raw op log of any document. <guess>We replayed the audit log to recover everything that had been reported lost. Total user-visible damage: a handful of paragraphs across the team and, to our knowledge, zero customer documents. Total damage to our cortisol levels: substantial.</guess>

The durable lesson: **in a CRDT system, persistence ordering is the whole game.** The math guarantees merge convergence; it guarantees nothing about your storage layer's write ordering. Treat the op log like a WAL, snapshots like an optimization, and never let a checkpoint delete the only copy of anything.

## What the server understands (and what it doesn't)

Here's the part of the design we'd defend most strongly: **the sync server doesn't understand documents.**

The Durable Object holds a `LoroDoc` and merges updates — but it has no idea what a heading is. Semantic understanding lives in exactly one place: Lexical. And because Lexical runs headless, "Lexical" doesn't mean "the browser":

- `js/lexical-core` defines every node type and ~120 markdown transformers, shared by client and server.
- `js/lexical-service` is a Cloudflare Worker running headless Lexical with endpoints like `GET /markdown/:docId` (export), `GET /search/:docId` (per-block text for the search index), `GET /cognition/:docId` (an AI-friendly rendering used to feed documents to agents), and `POST /snapshot/markdown` (markdown in → Loro snapshot bytes out).
- The Rust backend never parses markdown. When it needs to (imports, the DSS migration, search), it calls lexical-service over HTTP (`rust/cloud-storage/lexical_client`). We took a network hop to avoid a second parser implementation, and we'd take it again — every "the backend renders it slightly differently" class of bug is structurally impossible.

My favorite artifact of this design: the blank document. A new empty doc needs a valid Loro snapshot (root + one empty paragraph), and we didn't want doc-creation to block on a Worker call. So the TypeScript build generates a canonical blank-document snapshot — `markdown-golden.1.bin` — which is `include_bytes!`-ed **into the Rust binary**. Creating an empty doc is a fire-and-forget write of a precompiled CRDT snapshot, generated by the same Lexical code that will edit it. Goldens are verified by tests so the two worlds can't drift.

So: is the representation different between frontend and backend? The CRDT bytes are identical everywhere — that's the point. What differs is altitude: the client lifts the Loro doc into a live Lexical EditorState; the server mostly treats it as opaque merge-able bytes; and when anything backend-side needs *meaning* (markdown, search text, AI context), it asks headless Lexical rather than growing a second brain.

## Mentions, properties, and what stays out of the CRDT

A real document system constantly faces one question: does this piece of state live *inside* the collaborative document, or *adjacent* to it?

Our rule of thumb after two years: **put it in the CRDT if and only if it must move atomically with the text under concurrent editing.**

- **Mentions: inside.** An `@mention` of a person, contact, company, date, or another document is a custom Lexical node serialized into the doc (internally as an XML-ish tag with a JSON payload, e.g. `<m-user-mention>{"userId":"…","email":"…"}</m-user-mention>`). It has to be inside — it sits in the text flow, moves with cuts and pastes, and must merge like text. But the mention stores only the *reference*; names, avatars, previews, and backlink graphs resolve live from outside services. A renamed document updates everywhere it was ever mentioned.
- **Properties: adjacent, with a pointer inside.** Macro has a typed property system (strings, numbers, dates, selects, entity references) shared by docs, tasks, emails, and CRM records. Property *values* deliberately live outside the CRDT in that system — a task's status must be queryable ("all tasks where status = in-progress") without opening a CRDT, and it must be writable by automations that have no business holding an editor session. What lives *inside* the document is the lightweight presentation state: which property IDs are pinned to render as pills under the title, stored on the root node's state alongside doc metadata.
- **Comments: anchors inside, content adjacent.** Comment threads anchor to text ranges (so anchors must survive concurrent edits — they ride the CRDT), while thread content and notifications live in normal backend services.

[SCREENSHOT: a doc with pinned property pills under the title, an @mention with hover preview open, and a comment thread in the margin — one image that shows all three layers.]

This split has been one of our highest-leverage decisions. Every time we've been tempted to stuff queryable state into the document "because it's right there," we've regretted it; every time we've kept the CRDT scoped to "things that merge like text," it's stayed boring — and boring is what you want from the layer that can lose people's words.

## Markdown compatibility

Documents export as honest markdown, in two dialects from the same transformer pipeline: an **internal** dialect that round-trips losslessly (custom nodes serialize as those XML-ish tags), and an **external** dialect that's plain GitHub-Flavored Markdown — mentions degrade to readable text, Macro-specific constructs are stripped or flattened. Headings, lists, tables, code fences, quotes, task lists are all standard in both.

So yes — you can take your docs to Obsidian or any other editor (it's your data; the export is one endpoint). The honest caveat: a third-party editor renders the *external* dialect, so live mentions and embeds flatten. Compatibility is an exit ramp and an interchange format, not a live sync target.

## Dogfooding: the actual answer to "how is it good?"

The README says we've been dogfooding Macro for two years, and the editor took the brunt of it: every spec, every meeting note, every task description, every agent instruction the company writes goes through this code.

How important was that? It's most of the answer. <guess>Both marquee bugs in this post were found by us, on our own work, before any customer hit them at meaningful scale. The disconnect bug was *kept honest* by dogfooding — every "fixed it!" was falsified within days by someone's actual laptop doing actual laptop things, which is how we learned there were five root causes and not one.</guess>

And there's a real difference between *extensive* dogfooding and playing around a bit. Demo-driving an editor for twenty minutes exercises the happy path. Living in it exercises the grim 1%: laptops sleeping mid-sentence, hotel wifi, a doc left open in a background tab for nine days, two people pasting into the same table during a call, a 40-page spec with 300 mentions. <guess>Almost none of our nasty bugs were reachable from "play around" usage — they needed hours-long sessions and real stakes. If we hadn't been running the company on it, I'd estimate good would have taken two to three times longer — or worse, we'd have shipped "demo-good" and discovered "real-good" through churned customers instead of annoyed coworkers.</guess>

The other thing dogfooding bought us: shame-driven prioritization. When the CEO loses a paragraph, the fix does not go in a backlog.

## Did it work? (Results)

Where it stands today:

- **One sync layer, many surfaces.** Docs, canvas, and PDF markup all multiplayer through the same Durable Object service; tasks and agent instructions are the same editor. The marginal cost of making a new surface collaborative has dropped to roughly zero.
- **Offline works.** Edits queue locally and merge on reconnect — the same code path as the reconnect logic, which is why we trust it.
- **Version history with forking.** Snapshots at versions plus a server-side copy endpoint that can fork a document *at a historical version* — time-travel built on CRDT version vectors rather than a parallel revisions system.
- **Search and AI read the same truth.** Last peer disconnects → search re-extracts; agents read docs through the cognition endpoints. No stale mirrors.

<guess>Performance-wise: typical keystroke-to-remote-peer latency rides a single WebSocket hop through a Durable Object placed near the document's first users — tens of milliseconds in-region. Documents into the hundreds of pages stay editable; our worst real doc is a ~2 MB snapshot that loads in under a second. We have not load-tested 100 simultaneous editors on one doc because we are not Google, and the honest claim is "flawless at team scale (tens of concurrent editors), unproven at internet scale."</guess>

Would off-the-shelf have been better? <guess>Liveblocks or tiptap cloud would have gotten us to a multiplayer demo months faster — that's real, and pretending otherwise is cope. But the demo isn't the product. The things that make the editor *Macro* — one schema across docs/tasks/agents, server-side headless parity, permissions enforced per-message in our own auth, AI reading documents natively — are exactly the things that don't come off the shelf. We'd have spent the saved months building bridges to someone else's abstractions, and paying per-seat for the privilege.</guess>

### What would this cost on AWS?

We get asked this since the stack is "Cloudflare for sync, AWS for everything else." A sketch of the same architecture self-hosted on AWS — WebSocket termination (ALB or API Gateway), a stateful room tier (ECS/Fargate with sticky sessions, or Lambda + DynamoDB for op logs), Redis for presence, S3 for snapshots:

<guess>For our scale — order of 10k documents touched per day, sessions averaging ~20 minutes, low-single-digit concurrent editors per active doc — the Cloudflare bill for the sync tier lands in the **low hundreds of dollars a month**: DO request + duration pricing (rooms hibernate-ish between alarms), pennies for KV/R2/D1 at our volumes. The AWS sketch prices out at **$1.5k–3k/month** before you do anything clever — a couple of always-on Fargate services for room state, NAT and ALB fixed costs, DynamoDB write units for op logs, ElastiCache for presence — plus the cost that actually dominates: it's now a fleet you operate. Failover, draining stateful rooms on deploy, rebalancing hot shards — Durable Objects made all of that Cloudflare's problem. The dollar gap is maybe 5–10x; the ops gap is the real reason we'd choose DOs again. (Caveat fairly: DO pricing punishes chatty long-lived connections at much larger scale, and we re-run this math at every order of magnitude.)</guess>

<!-- Teo: replace the above with real invoice numbers if we're willing to share them — HN loves a real bill screenshot. -->

### Against the incumbents

| | Google Docs | Notion | Obsidian | Macro |
|---|---|---|---|---|
| Real-time multiplayer | ✅ best-in-class | ✅ | plugin/sync, limited | ✅ CRDT-native |
| Offline | partial | weak | ✅ best-in-class | ✅ |
| Markdown-native | ❌ | export-ish | ✅ | ✅ (GFM export) |
| Source available / self-hostable | ❌ | ❌ | ❌ (files are yours) | ✅ AGPL |
| Docs ↔ tasks ↔ email ↔ agents in one system | ❌ | partial | ❌ | ✅ the whole point |
| Conflict model | OT, server-authoritative | server-authoritative | file sync (conflicts possible) | CRDT, merges anywhere |

The honest framing: Google Docs still wins pure-document polish (suggesting mode, decade-hardened OT). Obsidian wins local-first purism — your vault is just files. Notion wins breadth of database views. We're not trying to out-Google Google on documents; the bet is that the *unification* — your doc mentioning a task assigned from an email thread, readable by an agent with the same permissions you have — is worth more than any single surface's tenth year of polish. And unlike all three, you can read every line of how your words get stored.

## Using open source: the Loro chapter

Lessons from betting a core system on a younger open-source CRDT:

1. **Read the source like it's yours, because it will be.** We hit a real loro-crdt bug where `EphemeralStore.subscribe` breaks under recursive aliasing; our workaround (`queueMicrotask`, with an apologetic `HACK` comment in `core/collab/awareness.ts:209`) shipped the same day. With a proprietary sync SDK that's a support ticket; with open source it's an afternoon.
2. **Forks are loans, not purchases.** Our `js/loro-mirror` is a vendored fork of [loro-dev/loro-mirror](https://github.com/loro-dev/loro-mirror) from an earlier version, with our modifications — and the license file in our tree literally documents the exit plan: *"We are planning on removing this and updating to using the latest version directly."* The fork was correct (we needed diffing behavior upstream didn't have yet) and it accrues interest monthly (we miss upstream fixes). Take the loan; schedule the repayment.
3. **Same-language client and server is an underrated superpower.** Loro being Rust-first means the *identical* CRDT implementation merges your edits in the browser (WASM) and in the Durable Object (WASM). An entire class of "client and server disagree about the merge" bugs doesn't exist for us.
4. <guess>**Collaboration with maintainers is great until roadmaps diverge.** We talked with the Loro team about building the editor-binding layer together — roughly, co-developing loro-mirror toward what a production block editor needs, with us as the proving ground. Everyone was friendly, calls were had, nothing shipped: we needed specific behaviors on a deadline, they (correctly) wouldn't rush them into a public API they'd have to support forever, so we forked, the moment passed, and upstream later evolved in a different direction. No villain in the story — just the standard physics of a startup's clock versus a library's. The takeaway isn't "don't collaborate"; it's "don't put a collaboration on your critical path."</guess>

## Team, timeline, what's next

<guess>The editor-and-sync surface has never had more than three engineers on it at once, and for long stretches it was one and a half. Rough arc: editor-on-S3 era through mid-2024; sync-service MVP — first two cursors in one doc — in about six weeks in late 2024; "the company lives in it" after roughly four more months of hardening; "we'd call it production-ready for strangers" only after the migration and the two great bugs, call it twelve to fourteen months end to end. The lesson hiding in there: multiplayer editing is maybe 20% editor and 80% everything around it — persistence ordering, reconnection, migration, observability.</guess>

What's next:

- <guess>**Wolf is un-forking the mirror.** The current effort (Wolf's, on our side) is retiring our loro-mirror fork in favor of current upstream — which means re-validating the diff layer, the layer where every subtle bug has ever lived, so it's being done with a parallel-running shadow mirror and golden-state comparisons rather than a leap of faith.</guess>
- <guess>**Comment-level permissions.** "Commenter" is enforced as "viewer" server-side today (the enum slot exists; the enforcement is a TODO we're paying down) — finishing that unlocks external-reviewer workflows.</guess>
- <guess>**Longer history, cheaper.** Shallow snapshots keep live payloads small; we want full time-travel UI over the op-log audit trail we already keep — the data's all there, the product isn't yet.</guess>
- <guess>**More surfaces on the same rails.** The queue: collaborative code blocks with LSP, agent-visible cursors (agents as presence-peers, editing alongside you), and live transclusion of blocks between documents.</guess>

## The takeaways, if you're building one

1. **The CRDT is the easy part.** Loro's merge semantics have essentially never been our bug. Our bugs lived in the mirror layer, the reconnect path, and persistence ordering. Budget accordingly.
2. **Durable Objects are the right shape for this problem** — one actor per document erases the hardest distributed-systems work — but you will fight the lifecycle (eviction, hibernation, alarms-as-heartbeats). Decide early that you're okay with the platform owning your room placement.
3. **Run your parser headless on the server.** One implementation of "what does this document mean," shared by editor, search, export, and AI, is worth a network hop. The `include_bytes!`'d golden snapshot is our favorite proof.
4. **Reconnect dumb.** Resume protocols are where edits go to die. Send the snapshot; let CRDT idempotency eat the redundancy.
5. **The op log is a WAL.** Persist operations before anything else, keep an audit copy, never let a checkpoint delete the only copy of an edit. Write this on the wall before your data-loss bug, not after.
6. **Dogfood at full intensity or don't bother.** Twenty-minute demos exercise the happy path; the bugs that matter need laptops that sleep, wifi that lies, and documents people actually care about losing.

The code is all there — [sync server](https://github.com/macro-inc/macro/tree/main/rust/sync-service), [mirror](https://github.com/macro-inc/macro/tree/main/js/loro-mirror), [editor](https://github.com/macro-inc/macro/tree/main/js/app/packages/block-md), [headless parser](https://github.com/macro-inc/macro/tree/main/js/lexical-service) — and so are we: it's the same editor we'll draft the response threads in. If you want to feel the result rather than read about it, [Macro is here](https://macro.com/app).

[GIF: closer — the "fork at a historical version" interaction in version history. Second choice: drag-reorder a nested list with two cursors live.]

<!--
Editor checklist for Teo:
1. Every <guess> block needs fact-check or rewrite — especially: Yjs/Automerge eval story, all dates/eras,
   both bug post-mortems, team size/timeline, cost numbers, the Loro collaboration story, Wolf's name/effort,
   and what "BFS" actually referred to internally (I inferred breadth-first tree reconciliation; the only
   literal BFS in the code is node-ID resolution in locationPlugin.ts).
2. Verify GitHub links resolve on the public repo (paths confirmed in-tree; branch assumed `main`).
3. Replace cost sketch with real invoice numbers if shareable.
4. Media: 1 video (offline merge), 3 screenshots, 1 gif, 1 rendered architecture diagram (ASCII included).
5. Consider trimming 15–20% for HN attention spans; candidates: markdown compatibility section,
   incumbent table prose.
-->
