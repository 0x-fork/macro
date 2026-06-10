# Block Feature Gap Analysis vs. Competitors

**Date:** 2026-06-10
**Method:** Code + docs inventory of every first-party block (`js/app/packages/block-*`, `rust/cloud-storage/*`, `docs/`), compared against the feature sets of the products each block competes with: Superhuman, Gmail, Outlook, Front, Linear, Jira, Asana, ClickUp, Slack, Teams, Discord, Salesforce, HubSpot, Attio, Pipedrive, Zoom, Google Meet, Notion, Google Docs, Confluence, Coda, Miro, FigJam, Adobe Acrobat, DocuSign, Loom, ChatGPT/Claude, Zapier, n8n, Glean.

Legend: 🔴 table-stakes gap (users expect it from the incumbent they're leaving) · 🟡 differentiator gap (incumbents have it, not strictly required to switch) · ✅ noted strength worth protecting.

---

## TL;DR — the ten biggest gaps

1. **No calendar, anywhere in the product.** No calendar block, no Google Calendar sync, no event creation, no scheduling links, no availability sharing. Gmail, Outlook, Superhuman, HubSpot, and Attio all bundle or integrate calendars; scheduling is the connective tissue between email, calls, and CRM. This is the single largest hole for "the last software app."
2. **Email is Gmail-only.** `UserProvider` enum has one variant: `Gmail`. No Outlook/Microsoft 365, no IMAP. This walls off roughly half the business email market before any feature comparison even starts.
3. **CRM has no deals/pipeline.** Records, enrichment, and shared threads are real, but without opportunities, stages, a kanban pipeline, import, and basic reporting it cannot replace HubSpot/Salesforce/Attio/Pipedrive for an actual sales motion.
4. **Calls can't be scheduled and externals can't join.** Calls are ad-hoc and channel-based; there's no meeting link a non-Macro user (i.e., a customer) can click. Ironically the calls→transcript→CRM-memory loop is most valuable on *external* calls, which Macro can't host today.
5. **Tasks have one view.** List only — no kanban board, no timeline/Gantt, no calendar view, no cycles/sprints, no roadmaps. Linear/Jira/Asana users will feel this immediately.
6. **Automations are cron-only.** No event triggers ("when an email arrives from X," "when a task moves to Done," "when a deal-stage changes"). This is the gap between Macro automations and Zapier/n8n/Slack Workflow Builder — and it's also what would make the agent layer compound.
7. **No import/export anywhere.** No Jira/Linear/Asana issue import (beyond one-shot agent-driven Notion/Linear pulls), no CSV import/export in CRM, no email export, no doc export beyond markdown. Switching costs stay high in both directions — hurts adoption more than retention.
8. **No snooze / reminders / follow-up nudges in email or channels.** Snooze, "remind me about this," scheduled messages, and send-and-follow-up are the core triage muscle memory of Superhuman, Gmail, and Slack.
9. **No public API / developer platform.** Channel webhooks and MCP exist (good bones), but there's no documented REST API, no outbound webhooks, no app directory. Every incumbent on the list has one.
10. **No Android app.** Slack/Teams/Gmail/Outlook are fully cross-platform; a team can't standardize on Macro if any member is on Android.

---

## 1. Email block — vs. Superhuman, Gmail, Outlook, Front

**Have today:** Gmail/Workspace sync, multi-account unified inbox, Signal/Noise AI triage, keyboard-driven triage (j/k/e), scheduled send (flagged), undo send, labels + sender-level filters, block sender, signatures, attachment handling (18 MB), contact autocomplete, shared/delegated mailboxes, share-thread-into-channel, agent email drafting/sending.

| Gap | vs. | Severity |
|---|---|---|
| Outlook / Microsoft 365 support (then IMAP) | Outlook, Superhuman, Front | 🔴 |
| Snooze / remind later | Superhuman, Gmail, Outlook, Hey | 🔴 |
| Follow-up reminders / "no reply yet" nudges | Superhuman, Front | 🔴 |
| Templates / snippets / canned responses | Superhuman, Gmail, Front | 🔴 |
| Calendar integration in email (see event in thread, RSVP, availability insert) | Gmail, Outlook, Superhuman | 🔴 |
| Unsubscribe helper (one-click, list-unsubscribe header) | Gmail, Superhuman, Hey | 🔴 |
| Read statuses / open tracking | Superhuman, HubSpot | 🟡 |
| Out-of-office / vacation responder | Gmail, Outlook | 🟡 |
| Custom split-inbox tabs beyond Signal/Noise | Superhuman (splits), Hey (Imbox/Feed/Paper trail) | 🟡 |
| Email assignment + shared-inbox workflows (assign thread to teammate, internal comments on threads) | Front, Missive | 🟡 (overlaps CRM/support play) |
| Inline AI: summarize thread, instant-draft inside composer (today AI lives in the agent chat, not in the email surface) | Superhuman AI, Gemini in Gmail, Copilot in Outlook | 🔴 |
| Offline email | Gmail, Outlook, Superhuman | 🟡 |
| Mute thread | Gmail | 🟡 |

✅ Strengths: multi-account single list; sender-level Signal/Noise; thread-sharing into channels; delegated mailboxes — Gmail and Outlook have nothing like the last two.

## 2. Calendar — vs. Google Calendar, Outlook Calendar, Notion Calendar, Calendly, Reclaim

**Have today: nothing.** No block, no sync, no UI.

| Gap | Severity |
|---|---|
| Calendar block: day/week views, event CRUD, Google Calendar (then Outlook) two-way sync | 🔴 — prerequisite for replacing Gmail/Outlook/Superhuman |
| Meeting scheduling links (Calendly-style booking pages) | 🔴 — expected by Superhuman/HubSpot/Attio users |
| "Share availability" in email composer | 🔴 |
| Calls integration: scheduled calls create events + join links | 🔴 (pairs with Calls gap #4) |
| Tasks-on-calendar / time blocking | 🟡 (Reclaim, Motion, Notion Calendar) |
| AI scheduling ("find 30 min with Jacob and the Acme team next week") | 🟡 — natural agent showcase |

## 3. Tasks / Projects — vs. Linear, Jira, Asana, ClickUp, Monday

**Have today:** statuses (fixed 5), priority, multi-assignee, due dates, subtasks/parent, depends-on, effort + story points, custom properties (full typed system), team task numbering, saved views, filter/group/sort engine, duplicate detection (vector + LLM judge), GitHub PR ↔ status sync, comments via threads, notifications, keyboard-first creation.

| Gap | vs. | Severity |
|---|---|---|
| Kanban board view | every competitor | 🔴 |
| Cycles / sprints (+ velocity, burndown) | Linear, Jira | 🔴 for eng teams |
| Customizable workflows/statuses per team | Jira, Linear | 🔴 |
| Timeline / Gantt view | Asana, Monday, ClickUp, Jira | 🟡 |
| Calendar view of due dates | Asana, ClickUp | 🟡 (depends on calendar) |
| Roadmaps / initiatives layer above projects | Linear, Jira (Advanced Roadmaps), Productboard | 🟡 |
| Recurring tasks | Asana, ClickUp, Todoist | 🔴 |
| Task & project templates | all | 🟡 |
| Triage inbox for new issues (Linear-style) | Linear | 🟡 |
| Importers: Linear, Jira, Asana (full-fidelity, not agent one-shots) | Linear (great Jira import) | 🔴 for adoption |
| Reporting: throughput, cycle time, dashboards | Jira, Linear Insights | 🟡 |
| Time tracking | ClickUp, Jira (Tempo) | 🟡 — skip unless agencies are a target |
| SLAs | Jira Service Mgmt | 🟡 — only matters for the support play |
| Rules-based automation (auto-assign, auto-close stale, status triggers) | Jira, Asana, ClickUp | 🔴 (same engine as gap #6) |
| GitLab/Bitbucket sync | Jira | 🟡 |

✅ Strengths: tasks-as-documents unified model; typed property system shared with CRM/docs; duplicate detection; GitHub auto-status is at parity with Linear's magic.

## 4. Channels — vs. Slack, Teams, Discord

**Have today:** public/private/DM/team channels, nested (Reddit-style) threads, reactions, rich text + full mention system, file sharing with previews, message edit/delete, per-channel mute, OpenSearch message search, in-channel calls with screen share, bots + incoming webhooks, @here, external participants via email invite, AI (@Macro) in channel.

| Gap | vs. | Severity |
|---|---|---|
| Pinned messages + saved/bookmarked ("Later") | Slack | 🔴 |
| Reminders ("remind me about this message in 3 hours") | Slack | 🔴 |
| Scheduled messages | Slack, Teams | 🔴 |
| Channel topics/descriptions | Slack, Discord | 🔴 (cheap) |
| Sidebar sections/folders for channels | Slack, Discord categories | 🟡 |
| Custom status / DND / presence | Slack, Teams | 🔴 |
| User groups (@design, @oncall) | Slack | 🟡 |
| Custom emoji (workspace-uploaded) | Slack, Discord | 🟡 (big culture feature) |
| Audio/video clips (async Loom-style messages) | Slack clips, Loom | 🟡 |
| Polls | Slack apps, Discord | 🟡 |
| Message forwarding/sharing across channels | Slack | 🟡 |
| Full guest experience & cross-org shared channels (Slack Connect) | Slack | 🟡 (email-invite externals is a partial answer) |
| Edit history visibility | Slack (edited indicator only) — Macro stores last-edit time only | 🟡 |
| Workflow builder (form → channel, join workflows) | Slack | 🟡 (same automation engine) |
| Slack import (history migration) | — | 🔴 for adoption |

✅ Strengths: Reddit-style nesting (deeper than Slack threads); every message is a mention-graph node; AI noise separation; bots/webhooks already exist.

## 5. CRM (contact/company) — vs. Salesforce, HubSpot, Attio, Pipedrive

**Have today:** auto-created contacts/companies from team email, domain rollup, generic-domain filtering, Apollo enrichment (~25 fields), first/last interaction tracking, Team/Me email visibility with per-company Email Sync toggle, hidden records, role-based access, discussion thread per record, records are blocks (mentionable, agent-readable).

| Gap | vs. | Severity |
|---|---|---|
| Deals/opportunities with pipeline stages + kanban view | all four | 🔴 — the gap between "contact book" and "CRM" |
| CSV import & export | all | 🔴 |
| Record merge / dedupe | all | 🔴 (auto-creation makes dupes inevitable: personal emails, multiple domains) |
| Saved filtered list views (segments: "customers," "investors," "trial accounts") | Attio (core strength), HubSpot lists | 🔴 |
| Tasks/follow-ups linked to records ("next step" on an account) | all | 🔴 |
| Calls & meetings logged on the record timeline (calls exist in-product but don't attach to CRM records!) | all | 🔴 — wiring that exists elsewhere in Macro |
| Pipeline reporting & forecasting | Salesforce, HubSpot | 🟡 |
| Email sequences / outreach / mail merge | HubSpot, Salesloft/Outreach | 🟡 |
| Lead assignment / record ownership | all | 🔴 (no owner field at all) |
| Custom objects | Salesforce, Attio | 🟡 |
| Forms / website lead capture | HubSpot | 🟡 |
| Workflow automation on records (stage-change triggers) | HubSpot, Salesforce | 🟡 (same engine) |
| Calendar/meeting integration on records | HubSpot, Attio | 🔴 (depends on calendar) |
| Public CRM API | all | 🟡 |

✅ Strengths: zero-data-entry record creation is the Attio pitch executed more aggressively; team email visibility with per-company opt-out is genuinely novel; records as first-class blocks for agents.

## 6. Calls — vs. Zoom, Google Meet, Teams

**Have today:** LiveKit WebRTC calls from channels, screen share, ringing + VoIP push (iOS CallKit), auto-recording to S3, diarized transcription with speaker enrollment, AI summary + action items (Sonnet), AI speaker attribution, team-memory sharing with per-call opt-out, post-call AI tools over transcripts, background blur, Krisp noise suppression.

| Gap | vs. | Severity |
|---|---|---|
| Scheduled meetings + calendar invites | all | 🔴 |
| External join links (guest joins in browser without account) | all | 🔴 — blocks all customer-facing calls |
| Live captions | Zoom, Meet, Teams | 🟡 |
| In-call chat, reactions, hand raise | all | 🔴 for >4-person calls |
| Host controls: mute others, mute all, remove (UI), waiting room | all | 🔴 for external calls |
| Grid view / pinning / layout control | all | 🟡 |
| Recording clips/sharing externally | Zoom, Loom | 🟡 |
| Breakout rooms, webinars, large-meeting scaling | Zoom | 🟡 — likely never worth it |
| PSTN dial-in | Zoom, Teams | 🟡 |
| Meeting-bot for external meetings (join Zoom/Meet calls to capture transcript when the meeting isn't on Macro) | Granola, Fireflies, Gong | 🟡 — alternative path to the same memory |

✅ Strengths: the record→transcribe→summarize→team-memory loop is ahead of Zoom/Meet defaults; per-call privacy opt-out is clean.

## 7. Docs — vs. Notion, Google Docs, Confluence, Coda

**Have today:** CRDT multiplayer with presence cursors + offline (Loro), full block editor (headings, lists, checklists, tables, code w/ syntax highlight, KaTeX math, media), markdown autoformat, slash menu, inline tasks, drag-reorder, find/replace with regex, inline threaded comments with resolve, full version history + fork-at-version, properties + pinned pills + YAML front matter, 6 templates, public links with logged-out preview, references/backlinks panel, embeds of other blocks.

| Gap | vs. | Severity |
|---|---|---|
| Databases / table views with typed columns (the property system exists — there's no Notion-style database UI over it) | Notion, Coda, Airtable | 🔴 — most-cited Notion feature |
| Page nesting / wiki hierarchy (sub-pages, breadcrumbs) | Notion, Confluence | 🔴 — folders are flat organization |
| Inline AI writing (continue, rewrite, summarize in-editor — currently disabled pending port) | Notion AI, Gemini in Docs, Copilot | 🔴 — re-enable; off-brand for an AI-first app |
| Toggles/collapsible blocks, columns, callouts | Notion | 🟡 (toggle 🔴 — heavily used) |
| Synced blocks | Notion | 🟡 |
| Table of contents block | Notion, Docs | 🟡 (cheap) |
| Suggestion mode / track changes | Google Docs, Word | 🟡 — matters for legal/external review |
| Export to PDF / DOCX | Docs, Notion | 🔴 (markdown-only export today) |
| Publish-as-site (styled public docs/wiki) | Notion sites, GitBook | 🟡 |
| User-creatable templates | Notion | 🟡 |

✅ Strengths: CRDT offline + multiplayer is technically ahead of Notion; version-fork is unique; cross-block embeds/mentions.

## 8. Canvas — vs. Miro, FigJam, tldraw, Excalidraw

**Have today:** infinite board, rect/ellipse/text/freehand, connectors (straight/curved/stepped, arrowheads), images, live workspace-block mentions on the board (unique), group/align/z-order/nudge, zoom-preserving share links, export as file.

| Gap | vs. | Severity |
|---|---|---|
| Real-time multiplayer cursors/presence (docs have it; canvas doesn't) | Miro, FigJam — whiteboards are *the* multiplayer artifact | 🔴 |
| Sticky notes | Miro, FigJam | 🔴 (the core whiteboard primitive) |
| Comments on canvas | Miro, FigJam | 🟡 |
| Frames/sections + presentation flow | Miro, FigJam | 🟡 |
| Shape library (diamond/flowchart/arrow shapes, etc.) | all | 🟡 |
| Templates (retro, brainstorm, flowchart) | Miro, FigJam | 🟡 |
| Mermaid / AI diagram generation | FigJam AI, Whimsical | 🟡 — natural agent feature |
| Voting/timer (workshop tools) | FigJam, Miro | 🟡 — skip |

## 9. Code block — vs. VS Code, GitHub, Jupyter

**Have today:** CodeMirror editor, 13+ language syntax highlight, sandboxed HTML preview with code/render toggle.

Gaps (all 🟡 — a viewer/scratchpad is probably the right scope): no execution/notebooks, no git awareness/diffs, no collaborative editing or comments on code, no version history. The agent layer already has code execution — surfacing agent-run results in a code/notebook block (Jupyter-lite) would be a differentiator rather than parity. GitHub PR review in-app would be a bigger unlock than editor features (PR metadata sync already exists).

## 10. PDF block — vs. Adobe Acrobat, DocuSign, Dropbox Sign

**Have today:** PDF.js viewer, in-PDF search, TOC + bookmarks, highlights, free-text comments + threads, text boxes, signature pad, definition lookup, CRDT-synced markup.

| Gap | vs. | Severity |
|---|---|---|
| Form filling (AcroForms) | Acrobat, Preview | 🔴 for any business-doc workflow |
| Real e-signature flow (send for signature, signing order, audit trail, legal certificate) | DocuSign, Dropbox Sign | 🟡 — drawing-a-signature ≠ e-sign product; big wedge for the CRM/sales motion if built |
| OCR for scanned docs (also gates search/agent reading of scans) | Acrobat | 🟡 |
| Page operations (merge, split, reorder, rotate) | Acrobat, smallpdf | 🟡 |

## 11. Image & Video blocks — vs. Loom, Markup.io, CloudApp/Zight

**Have today:** image viewing; HTML5 video playback.

Gaps: image annotation/markup + comments (🟡, design/marketing reviews), video transcription + AI summary (🟡 — odd asymmetry: calls get transcribed, uploaded videos don't, even though the pipeline exists), screen recording (Loom-style async video, 🟡 — pairs with channel clips, gap #4 in Channels), captions, comments-at-timestamp (🟡, Frame.io-lite).

## 12. Agents & Automations — vs. ChatGPT/Claude, Zapier, n8n, Notion AI, Glean

**Have today:** Claude Opus/Sonnet/Haiku with extended thinking, 16+ workspace tools (search, email send, doc/task create, properties, calls, channels, web search/fetch, code execution, subagents), nightly auto-generated personal + team memory with judge validation, cron automations (up to 20-min agent runs) with results to inbox, @Macro in channels, MCP both directions (consume external servers; expose Macro at mcp-server.macro.com), permission inheritance from the user.

| Gap | vs. | Severity |
|---|---|---|
| Event triggers (email received, task status changed, message posted, record updated, webhook in) | Zapier, n8n, Slack workflows | 🔴 — the single highest-leverage platform gap; unlocks rules in tasks/CRM/channels/email simultaneously |
| Approval gates / human-in-the-loop before externally visible actions (send email, etc.) | Zapier paths, enterprise agent platforms | 🔴 — trust blocker for agent email send |
| User-visible/editable memory | ChatGPT memory UI, Claude memory | 🟡 — opaque memory will spook enterprises |
| Multi-step workflow builder (conditionals, branching) — prompt-as-automation may be the bet, but inspectability/retries/error handling are still needed | Zapier, n8n | 🟡 |
| Agent action audit log UI | enterprise agent platforms | 🟡 |
| Connector breadth (Salesforce, HubSpot, Drive, Confluence, Zendesk… today: GitHub native + Notion/Slack/Linear via MCP) | Glean (100+), Zapier (7000+) | 🟡 — MCP strategy is right; curate a directory |
| Channel-message send tool for agents (agents can read channels but not post except via @Macro reply) | — | 🟡 |
| Prompt library / shared team agents & automations | ChatGPT shared GPTs, Claude Projects | 🟡 |

✅ Strengths: team-level memory is the moat — nothing on the competitor list has it; MCP-first posture; code execution + subagents.

## 13. Inbox & Search — vs. Glean, Superhuman, Slack

**Have today:** unified notification inbox across all blocks with Signal/Noise, j/k/e triage, AI box at the bottom; unified ~50ms search over titles + bodies + email + messages + call transcripts + file contents, type and person filters, quoted exact match.

Gaps: snooze a notification (🔴 — same primitive as email snooze), semantic/natural-language search & answer-style results (🟡 — Glean; partially covered by agents using the index), search operators (`from:`, `in:`, `before:`) (🟡), per-source notification preferences/digest tuning (🟡).

## 14. Platform & cross-cutting

| Gap | vs. | Severity |
|---|---|---|
| Android app | every competitor | 🔴 |
| Public REST API + outbound webhooks + docs | every competitor | 🔴 for "last app" credibility |
| Importers as products (Slack history, Notion workspace, Jira/Linear, CRM CSV) | Linear's Jira import, Notion's importers | 🔴 — adoption is the war |
| Guest/external collaborator model unified across blocks (channels partially; tasks/CRM/canvas none) | Slack Connect, Notion guests | 🟡 |
| Org-wide admin: SSO/SAML, SCIM, audit logs, retention policies, eDiscovery | Slack/Teams/Salesforce enterprise tiers | 🟡 now, 🔴 the moment a 200-seat deal appears |
| Offline beyond docs | Gmail, Linear | 🟡 |
| Windows/Mac desktop app (Tauri scaffolding exists in `src-tauri`) | Slack, Superhuman, Linear | 🟡 |

## 15. Whole categories not yet covered (the "last software app" lens)

In rough order of adjacency to what's already built:

1. **Calendar & scheduling** (Google/Outlook Calendar, Calendly) — covered above; most urgent.
2. **Spreadsheets / lightweight databases** (Airtable, Sheets, Notion databases) — the typed property system + saved views are 60% of an Airtable; a grid UI over entities would cover most internal-tracker use cases.
3. **Customer support / shared external inbox** (Zendesk, Intercom, Front) — shared mailboxes + assignment + SLAs on top of existing email/channels; natural extension of the CRM motion.
4. **Forms & surveys** (Typeform, Google Forms) — feeds CRM lead capture and channel workflows.
5. **Async video / screen recording** (Loom) — record-to-channel; transcription pipeline already exists.
6. **E-signature** (DocuSign) — PDF block is 40% there; closes the sales loop with CRM.
7. **Knowledge publishing** (Notion sites, GitBook, Confluence spaces) — public docs already render; needs hierarchy + theming.
8. **Slides/presentations** (PowerPoint, Pitch, Gamma) — canvas frames + presentation mode is the cheap path; AI generation is the differentiated one.
9. **Dashboards/BI** (Metabase, Looker) — only once tasks/CRM reporting exists; agents-as-analyst may substitute.
10. **HRIS/ATS, finance, password mgmt** — out of scope; integrate via MCP.

---

## Suggested priority reading of all of the above

**Now (adoption blockers):** calendar v1 + Google Calendar sync · Outlook email support · scheduled external-join calls · task board view · CRM deals/pipeline + CSV import + record owner · snooze/reminders (email, inbox, channels) · re-enable inline doc AI.

**Next (retention/expansion):** event-triggered automations + approval gates · importers (Slack/Jira/Linear/Notion/CSV) · pins/saved/scheduled messages, statuses, custom emoji · cycles + recurring tasks + workflow customization · Notion-style database views over the property system · page nesting · multiplayer canvas + sticky notes · calls↔CRM record logging · Android.

**Later (category expansion):** support inbox · forms · Loom-style clips · e-signature · publishing · slides · reporting dashboards · enterprise admin (SSO/SCIM/audit).
