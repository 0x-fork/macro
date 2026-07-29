
<div align="center">
  <a target="_blank" href="https://macro.com">
    <img width="2195" height="721" alt="Frame 11" src="https://github.com/user-attachments/assets/50405352-785e-4984-b24f-544e89731acb" />
  </a>

  <p>
    <a href="https://macro.com/app">Sign up</a>
    ·
    <a href="https://docs.macro.com">Docs</a>
    ·
    <a href="https://cal.com/team/macro/macro-demo-call?metadata%5Bfbp%5D=fb.1.1778954074516.817396687896036613">Book demo</a>
    ·
    <a href="https://macro.com">Website</a>
    ·
    <a href="mailto:contact@macro.com">Feature requests</a>
    ·
    <a href="CONTRIBUTING.md">Contribute</a>
    ·
    <a href="mailto:teo@macro.com">Hiring</a>
  </p>
</div>


Most engineering teams run five or six tools that each own one slice of the workday: a chat app, an issue tracker, a doc editor, a note-taking tool, an email client. Each tool stores its own data, maintains its own search index, and has no awareness of what lives in the others.

Macro is a single application that covers all of those surfaces, backed by one database, so that the boundaries between messaging, documents, tasks, email, and code stop being product boundaries and become features of the same system.

## Stack

The backend is Rust, not Node, not Electron: a Cargo workspace of 167 crates behind 42 deployable services, built on `axum` and `sqlx` with compile-time-checked queries against Postgres. Kafka carries events, OpenSearch handles search, and the client talks to it over `async-graphql`.

The frontend is SolidJS, and documents use Loro CRDTs for real-time collaboration. A Nix flake pins the toolchain; `just` drives everything else.

### Quick start

```bash
git clone https://github.com/macro-inc/macro.git
cd macro
nix develop          # Rust toolchain, Bun, sqlx, zig, cargo-zigbuild
just run_local       # local infra + backend services + proxy + frontend
```

`run_local` prints the frontend URL once the stack is up; `r` rebuilds changed Rust services, `q` tears it down. See [Running locally](docs/RUNNING_LOCALLY.md) for Doppler setup and named instances.

```bash
just check                    # type check the workspace
just clippy                   # lints
just test                     # full test suite
cargo test -p email_service   # a single service
```

### Repository layout

```
macro/
├── apps/
│   ├── web/       SolidJS client — browser, Tauri desktop, mobile
│   └── docs/      docs.macro.com
├── services/      42 deployable services, workers, and Lambda handlers
├── crates/        167 Rust libraries — domain logic, models, db clients
├── packages/      shared TypeScript — collaboration, lexical-core, loro-mirror
├── infra/         Pulumi definitions
├── docker/        local Compose stack
├── nix/           pinned dev shell and build inputs
└── tooling/       repo scripts and code generators
```

Services follow a hexagonal layout: inbound adapters, a domain core with ports, outbound adapters. [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md) has the conventions and [`CONTRIBUTING.md`](CONTRIBUTING.md) covers the PR process.

## Features

Documents are documents. Tasks are tasks. Channels are channels. Each surface is purpose-built for its job rather than composed from a generic block primitive — but every one of them shares a backend, so cross-references between a doc and a task, or a channel message and an email, are native rather than something you wire up.

### Email

Keyboard-first with the same emphasis on speed that made Superhuman the benchmark for email UX. Multi-account and unified, with shared inboxes for support@ and sales@ so a thread is never stuck in one person's mailbox.

The difference is that the inbox lives in the same interface as channels, docs, tasks, and code. An email can become a task, reference a document, or surface in an AI response alongside a channel thread, because all of those entities share a database. Superhuman optimized one tab; Macro is the case for needing fewer tabs in the first place.

![Macro email thread with actions, tags, and properties in the sidebar](.github/readme/email-thread.png)

[Email docs &rarr;](https://docs.macro.com/product/email)

### Messages

Real-time channels and threads that work the way you would expect from a team messaging tool, but messages share a database with documents, tasks, and email. Search in Slack searches Slack; here, when you search, you search everything.

A message can become a task with one click, and that task links back to the conversation it came from, because they are entries in the same system rather than records bridged by a webhook. GitHub checks and PRs render inline, and channel membership doubles as the permission model.

![Macro #Engineers channel with threads, mentions, and an inline GitHub check](.github/readme/messages-channel.png)

[Messages docs &rarr;](https://docs.macro.com/product/channels)

### Tasks

An issue tracker only has access to issues. It cannot see the thread where the bug was first reported, or the doc where the architecture decision was made, or the email from the customer who triggered the investigation, so you end up copying context between tools by hand.

In Macro, tasks are first-class entities that live alongside channels, documents, and email, and creating a task from a message preserves the link automatically.

- Sort, group, and filter by assignee, status, priority, or any custom property.
- Linked pull requests show live status and diff size on the task itself.
- Agents pick up, work, and close tasks alongside the rest of the team.

![Macro tasks list grouped by assignee, with a task detail showing its source message and linked PR](.github/readme/tasks-list.png)

[Tasks docs &rarr;](https://docs.macro.com/product/tasks)

### Docs

Collaborative, version-controlled, markdown-native docs, built on CRDTs so several people and several agents can edit at once. Backlinks are automatic: the References panel on any doc lists everywhere it has been mentioned.

A Notion workspace tends to accumulate complexity — nested databases, template hierarchies, relation properties linking pages to pages. That rewards people who enjoy building systems, but most engineers would rather use a system than build one. Macro trades configurability for less time spent configuring: checklists, tags, and properties are enough to turn a doc into a plan or a spec, and nothing has to be wired up first.

![A PRD in Macro with tags, assignees, properties, and references](.github/readme/docs-prd.png)

![A Macro doc with checklists that @link out to tasks, messages, and other docs](.github/readme/docs-checklist.png)

[Docs &rarr;](https://docs.macro.com/product/docs)

### File storage

Files arrive on their own — imported from email and channels, indexed by content rather than filename, and readable in place. PDFs open in a real viewer with comments and annotations, and every file keeps a pointer back to the message it came in on.

![A PDF opened in Macro's viewer, auto-imported from an email thread (document contents blurred)](.github/readme/files-pdf-viewer.png)

[File storage docs &rarr;](https://docs.macro.com/product/folders)

### CRM

Contact and company objects with custom properties, email sync, and enrichment. Since email already lives in Macro, the pipeline updates itself rather than asking anyone to log activity, and a company record shows the whole team's correspondence instead of only yours.

Board and list views group by any property — stage, owner, revenue — and records @link to the threads, docs, and tasks around them.

![Macro CRM board grouped by pipeline stage](.github/readme/crm-board.png)

![A Macro company record with properties, contacts, and team-wide email history](.github/readme/crm-company.png)

[CRM docs &rarr;](https://docs.macro.com/product/crm)

### Agents

Notion's AI operates within the context of a single page or database. Macro's operates across the entire workspace: Claude is integrated on every surface with access to email, messages, tasks, docs, files, and calls, scoped to exactly the permissions you have. When it answers a question it can pull from a channel conversation, a design doc, and an email thread in the same response.

Coding agents get the same access. Hand a task to Claude Code straight from the task view and it opens a branch and reports back on the task itself; point any MCP client at your workspace and it can read and write the same database.

![A Macro task being handed off to a coding agent, with a linked branch](.github/readme/agents-task-handoff.png)

[Agents docs &rarr;](https://docs.macro.com/product/agents)

### Also included

Canvas is a 2D board with embedded @links, for planning that doesn't fit in a list. Calls are recorded, transcribed, and logged to team memory. Pull requests link to tasks and embed in channels. All three are documented at [docs.macro.com](https://docs.macro.com).

## How it holds together

Four ideas make the blocks above behave as one system.

**Bidirectional @linking.** @mention a doc in a message and both know about each other. Your workspace becomes a web of context you can navigate in either direction.

**Channel-based permissions.** Anything you @mention in a channel is automatically shared with its members. Join a channel, gain access; leave, lose it. No permission-request dance.

**Unified memory.** Agents remember what your whole team is doing across email, messages, tasks, docs, and calls, not just your own chat history. Refreshed nightly.

**One inbox.** Emails, channel messages, task assignments, @mentions, and agent responses all land in one place, split into Signal and Noise. Keyboard-first throughout.

Deeper reading: [key concepts](https://docs.macro.com/concepts/blocks) covers blocks, mentions, properties, and permissions; the [FAQ](https://docs.macro.com/faq) covers comparisons, licensing, and self-hosting.

## Using the hosted app
 
[Sign up](https://macro.com/app) and connect your Gmail or Google Workspace account. Macro runs in any modern browser, with an [iOS app](https://apps.apple.com/us/app/macro-app/id6743133649) for your phone. The [getting started guide](https://docs.macro.com/getting-started) takes you from a fresh account to a working setup in about 15 minutes. Coming from Notion, Slack, Superhuman, or Linear? See [Switch to Macro](https://docs.macro.com/switch-to-macro).
 
## Agents & MCP
 
Your coding agents can use Macro too. Point Claude Code, Codex, or any MCP client at your workspace:
 
```bash
claude mcp add --transport http macro https://mcp-server.macro.com/mcp
```
 
See [MCP setup](https://docs.macro.com/AI/mcp/overview) and [agent recipes](https://docs.macro.com/AI/recipes) for what they can do once connected.

# Security

<img width="520" alt="ISO 27001 and SOC 2 Type II badges" src=".github/readme/security-badges.svg" />

Enterprise-grade security. Zero data retention with model providers, including no training on customer data. SOC 2 Type II certified. We welcome responsible security reports and pay bounties in accordance with severity and impact. Send reports to [security@macro.com](mailto:security@macro.com).

# License

Macro is fully open source — not "open core" — under the GNU Affero General Public License v3.0. See `LICENSE.txt` for details.

You can self-host Macro under the terms of the AGPLv3; the [FAQ](https://docs.macro.com/faq) covers what that involves. If you want to build on top of Macro under a different license, contact [licensing@macro.com](mailto:licensing@macro.com). For managed hosting or commercial arrangements, contact [self-host@macro.com](mailto:self-host@macro.com).

# Community

Have an idea, want to contribute, or want to work on Macro?

- Feature requests: [contact@macro.com](mailto:contact@macro.com)
- Contributions: see our [contribution guidelines](CONTRIBUTING.md)
- Hiring: [teo@macro.com](mailto:teo@macro.com)

Macro has raised $30m led by a16z. We are based in NYC.

<a href="https://github.com/macro-inc/macro">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/readme/star-history-dark.svg" />
    <img alt="Star history for macro-inc/macro, from launch to 672 stars" src=".github/readme/star-history-light.svg" width="100%" />
  </picture>
</a>

If Macro is useful to you, starring the repo helps other people find it.

<div align="center">
  <a target="_blank" href="https://macro.com/app">
    <img width="2195" height="721" alt="Frame 12" src="https://github.com/user-attachments/assets/61b846b0-0a61-4a65-9f7b-0e605e209d12" />
  </a>
</div>
