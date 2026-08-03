
<div align="center">
  <a target="_blank" href="https://macro.com">
    <img width="2195" height="721" alt="Frame 11" src="https://github.com/user-attachments/assets/50405352-785e-4984-b24f-544e89731acb" />
  </a>

  <br />
  <br />

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

Macro is the all-in-one workspace that combines email, messages, docs, tasks, code, agents, calls, and CRM into a single fast interface. With shared team-level memory, everything in your workspace is @linked and queryable, so your team and your agents never have to switch tools.

# Why Macro

We built Macro because we wanted a single unified system for our startup. There are many good products — e.g. Slack, Linear, Notion, HubSpot, and Superhuman — but they don't work together as one. As we scaled our last venture to ~20 people things started to break... every team got their own tools and the company was held together by MCP and Zapier. Nobody had the full picture of what was going on and it became chaotic. 

Macro is a complete redesign of work software from the ground up as a single system. Designed by us, dogfooded by our team of ~15 across our NYC and Toronto office. Built in in SolidJS and Rust for speed and reliability. We're focused on building something that any small company or team at a larger company can use as their "operating system".

# Features

Macro is composed of 'blocks' designed to be modular, extensible, and work together like Lego. For each block, we studied the best prior art and tried to make it even better.

Each surface is purpose-built for its job rather than composed from a generic block primitive — but every one of them shares the same backend; cross-references between a doc and a task, or a channel message and an email, are natively stored as a **bidirectional graph**.

| Block | What it does |
| --- | --- |
| [Email](https://docs.macro.com/product/email) | Multi-account unified inbox, keyboard shortcuts, and shared inboxes. Gmail. |
| [Messages](https://docs.macro.com/product/channels) | Channels and direct messages designed for focused technical discussions. |
| [Tasks](https://docs.macro.com/product/tasks) | Linear-inspired tasks, tightly integrated with channels, email, and agents. |
| [Docs](https://docs.macro.com/product/docs) | Real-time collaborative, markdown-native docs built on CRDTs, with @mentions. |
| [Canvas](https://docs.macro.com/product/canvas) | 2D board with embedded @links to tasks, files, and emails. |
| [Agents](https://docs.macro.com/product/agents) | Unified, team-level memory. Can take action on your behalf. |
| [Calls](https://docs.macro.com/product/calls) | Recorded, transcribed, and logged to team memory for agents. |
| [File storage](https://docs.macro.com/product/folders) | Auto-imported from email and channels, fully searchable. |
| [Pull requests](https://docs.macro.com/integrations/github) | Linked to tasks, embeddable in channels, available to agents. |
| [CRM](https://docs.macro.com/product/crm) | Customer and contact objects, custom properties, email sync, enrichment. |

## **Multiple email inbox** w/ good AI tools, integrated CRM

Macro Mail is inspired by Superhuman's keyboard-first interface with a few key additions:

1. Multi-account. Triage all your Google accounts in a single inbox, with the same tagging and sharing system. Or triage individually.
2. Unified inbox: emails, messages, @mentions, and tasks to complete, all in the same list. Use `j` `k` and `e` to navigate everything.
3. Better AI, with a tools/MCP surface designed to work across inboxes and to help your agents more accurately retrieve information. For example, we expose a unified search tool that allows agents to search all file attachment pdf's (parsed out of email) directly, rather than pulling email threads then attachments. You can also draft, edit and send emails right from AI chats, without opening your email.

![Macro email thread with actions, tags, and properties in the sidebar](.github/readme/email-thread.png)

4. Multitasking ability — Macro has a built-in window manager that lets you create 3+ splits (scales with monitor size) so you can draft emails while reviewing prior threads.
5. Company/Contact objects. Macro has native CRM capability so you can `cmd+k` to a contact, like tim@acme.com to see all emails between you and that person, or companies, to see all emails and files between everyone on your team and everyone at that company, e.g. `@acme.com`. All of this right from your email without having to open a heavyweight CRM like HubSpot or Salesforce. Email aggregation by contact or company is also available to your agents so they can better assist with CRM-type queries and actions.

Macro Mail lives in the same interface as channels, docs, tasks, and code. From any email, hit "task" to create a linked task, e.g. a ticket for an engineer from a customer support email. @mention emails in documents, e.g. @Re: Contract Signature.eml inside of Todos.md. In Macro, your email is brought into the fold with all of your tools, and your team, in the same permissions system: just hit `Share` to share an email to any DM or channel — no need to screenshot.

[Email docs &rarr;](https://docs.macro.com/product/email)

## **Team chat** for focused technical discussions

Macro Chat is designed to be more focused than Slack. The first couple of replies show inline and the rest collapse into a thread, so a busy channel stays readable. Threads are permissioned severally so you can share threads across channels by copying links. Everything is stored in a bidirectional graph, so tasks @link to messages that created them, customer support emails tie into support channels, CRM records get updated when they're discussed in messages, etc. The core idea is that (i) messaging should be the centerpiece around which tasks, mail, docs, and content management is built around, all in a lightweight way, and agents should be first-class citizens like human users and (ii) messaging needs to be more focused and readable for technical conversations, and not turn into battles where context is lost and progress is indistinguishable from noise.

![Macro #Engineers channel with threads, mentions, and an inline GitHub check](.github/readme/messages-channel.png)

[Messages docs &rarr;](https://docs.macro.com/product/channels)

## **Task management** build around chat

An issue tracker only has access to issues. It cannot see the thread where the bug was first reported, or the doc where the architecture decision was made, or the email from the customer who triggered the investigation, so you end up copying context between tools by hand.

In Macro, tasks are first-class entities that live alongside channels, documents, and email, and creating a task from a message preserves the link automatically.

- Sort, group, and filter by assignee, status, priority, or any custom property.
- Linked pull requests show live status and diff size on the task itself.
- Agents pick up, work, and close tasks alongside the rest of the team.

![Macro tasks list grouped by assignee, with a task detail showing its source message and linked PR](.github/readme/tasks-list.png)

[Tasks docs &rarr;](https://docs.macro.com/product/tasks)

## Docs

Collaborative, version-controlled, markdown-native docs, built on CRDTs so several people and several agents can edit at once. Backlinks are automatic: the References panel on any doc lists everywhere it has been mentioned.

A Notion workspace tends to accumulate complexity — nested databases, template hierarchies, relation properties linking pages to pages. That rewards people who enjoy building systems, but most engineers would rather use a system than build one. Macro trades configurability for less time spent configuring: checklists, tags, and properties are enough to turn a doc into a plan or a spec, and nothing has to be wired up first.

![A PRD in Macro with tags, assignees, properties, and references](.github/readme/docs-prd.png)

[Docs &rarr;](https://docs.macro.com/product/docs)

## CRM

Contact and company objects with custom properties, email sync, and enrichment. Since email already lives in Macro, the pipeline updates itself rather than asking anyone to log activity, and a company record shows the whole team's correspondence instead of only yours.

Board and list views group by any property — stage, owner, revenue — and records @link to the threads, docs, and tasks around them.

![Macro CRM board grouped by pipeline stage](.github/readme/crm-board.png)

[CRM docs &rarr;](https://docs.macro.com/product/crm)

## Agents

Notion's AI operates within the context of a single page or database. Macro's operates across the entire workspace: Claude is integrated on every surface with access to email, messages, tasks, docs, files, and calls, scoped to exactly the permissions you have. When it answers a question it can pull from a channel conversation, a design doc, and an email thread in the same response.

Coding agents get the same access. Hand a task to Claude Code straight from the task view and it opens a branch and reports back on the task itself; point any MCP client at your workspace and it can read and write the same database.

![A Macro task being handed off to a coding agent, with a linked branch](.github/readme/agents-task-handoff.png)

[Agents docs &rarr;](https://docs.macro.com/product/agents)

# How it holds together

Four ideas make the blocks above behave as one system.

**Bidirectional @linking.** @mention a doc in a message and both know about each other. Your workspace becomes a web of context you can navigate in either direction.

**Channel-based permissions.** Anything you @mention in a channel is automatically shared with its members. Join a channel, gain access; leave, lose it. No permission-request dance.

**Unified memory.** Agents remember what your whole team is doing across email, messages, tasks, docs, and calls, not just your own chat history. Refreshed nightly.

**One inbox.** Emails, channel messages, task assignments, @mentions, and agent responses all land in one place, split into Signal and Noise. Keyboard-first throughout.

Deeper reading: [key concepts](https://docs.macro.com/concepts/blocks) covers blocks, mentions, properties, and permissions; the [FAQ](https://docs.macro.com/faq) covers comparisons, licensing, and self-hosting.

# Using the hosted app
 
[Sign up](https://macro.com/app) and connect your Gmail or Google Workspace account. Macro runs in any modern browser, with an [iOS app](https://apps.apple.com/us/app/macro-app/id6743133649) for your phone. The [getting started guide](https://docs.macro.com/getting-started) takes you from a fresh account to a working setup in about 15 minutes. Coming from Notion, Slack, Superhuman, or Linear? See [Switch to Macro](https://docs.macro.com/switch-to-macro).
 
# Agents & MCP
 
Your coding agents can use Macro too. Point Claude Code, Codex, or any MCP client at your workspace:
 
```bash
claude mcp add --transport http macro https://mcp-server.macro.com/mcp
```
 
See [MCP setup](https://docs.macro.com/AI/mcp/overview) and [agent recipes](https://docs.macro.com/AI/recipes) for what they can do once connected.

# Repository

The backend is Rust, not Node, not Electron: a Cargo workspace of 167 crates behind 42 deployable services, built on `axum` and `sqlx` with compile-time-checked queries against Postgres. Kafka carries events, OpenSearch handles search, and the client talks to it over `async-graphql`.

The frontend is SolidJS, and documents use Loro CRDTs for real-time collaboration. A Nix flake pins the toolchain; `just` drives everything else.

## Running it locally

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

## Layout

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

# Star us on GitHub

If Macro is useful to you, please give the repo a star. Stars are how most people hear about Macro — they move us up GitHub's search and trending pages, and they make it much easier for anyone sharing Macro to get it taken seriously by their own team. It takes one click and it genuinely helps.

<a href="https://github.com/macro-inc/macro">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/readme/star-history-dark.svg" />
    <img alt="Star history for macro-inc/macro, from launch to 713 stars" src=".github/readme/star-history-light.svg" width="100%" />
  </picture>
</a>

<div align="center">
  <a target="_blank" href="https://macro.com/app">
    <img width="2195" height="721" alt="Frame 12" src="https://github.com/user-attachments/assets/61b846b0-0a61-4a65-9f7b-0e605e209d12" />
  </a>
</div>
