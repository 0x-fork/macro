
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


Macro is the all-in-one workspace that combines email, messages, docs, tasks, code, agents, calls, and CRM into a single fast interface. With shared team-level memory, everything in your workspace is @linked and queryable, so you and your agents never lose context.

Macro has raised $30m led by a16z. We are based in NYC.


## Features

Full documentation lives at [docs.macro.com](https://docs.macro.com). Every block below is the same object under the hood, so anything can be @linked to anything else.

### [Email](https://docs.macro.com/product/email)

The fastest, smartest email client — the best of Superhuman, Gmail, and Outlook in one keyboard-first inbox. Multi-account and unified, with shared inboxes for support@ and sales@ so a thread is never trapped in one person's mailbox.

- Turn any thread into a task or a doc without leaving the inbox.
- Tag and add custom properties to threads, then filter on them like a database.
- Ask Macro to draft, summarize, or dig up the last time you talked to someone.
- Attachments are auto-imported to file storage and indexed for search.

![Macro email thread with actions, tags, and properties in the sidebar](.github/readme/email-thread.png)

### [Messages](https://docs.macro.com/product/channels)

Team chat built for focused deep work. Channels and DMs where technical discussion actually stays readable, with threads that don't bury the main conversation.

- @link a doc, task, PR, or email into a message and both sides remember it.
- Channel membership *is* the permission model — join a channel, gain access to everything mentioned in it.
- GitHub checks, PRs, and deploys render inline, so you triage without tab-hopping.
- Jump straight into a [call](https://docs.macro.com/product/calls) from any channel.

![Macro #Engineers channel with threads, mentions, and an inline GitHub check](.github/readme/messages-channel.png)

### [Tasks](https://docs.macro.com/product/tasks)

Keyboard-first tasks built around the messages that created them. A bug report in a channel becomes a task in one keystroke, keeping the original conversation attached — no re-explaining the context in a tracker that lives somewhere else.

- Sort, group, and filter by assignee, status, priority, or any custom property.
- Linked pull requests show live status and diff size on the task itself.
- Agents can pick up, work, and close tasks alongside your team.

![Macro tasks list grouped by assignee, with a task detail showing its source message and linked PR](.github/readme/tasks-list.png)

### [Docs](https://docs.macro.com/product/docs)

Collaborative, version-controlled, markdown-native docs built for agents. Real-time editing on CRDTs, so two people and two agents can write at once without stepping on each other.

- Backlinks are automatic: the References panel shows every place a doc is mentioned.
- Checklists, tags, and properties turn a doc into a lightweight plan or spec.
- "Edit with AI" and "Ask Macro" work against the doc *and* everything it links to.
- Full history, so you can see what changed and who (or what) changed it.

![A PRD in Macro with tags, assignees, properties, and references](.github/readme/docs-prd.png)

![A Macro doc with checklists that @link out to tasks, messages, and other docs](.github/readme/docs-checklist.png)

### [File storage](https://docs.macro.com/product/folders)

Files auto-imported from email and channels, fully searchable, and readable in place. PDFs open in a real viewer with annotations and comments — no download, no "which version was this again?".

- Every file keeps a pointer back to the email or message it arrived on.
- Full-text search across contents, not just filenames.
- Comment and annotate inline; agents can read the contents too.

![A PDF opened in Macro's viewer, auto-imported from an email thread (document contents blurred)](.github/readme/files-pdf-viewer.png)

### [CRM](https://docs.macro.com/product/crm)

Contact and company objects with custom properties, email sync, and enrichment. Because email already lives in Macro, the pipeline updates itself instead of asking your team to log activity.

- Board and list views grouped by any property — stage, owner, revenue.
- Every company record shows the whole team's email and calendar history, not just yours.
- Contacts, threads, docs, and tasks all @link to the record.

![Macro CRM board grouped by pipeline stage](.github/readme/crm-board.png)

![A Macro company record with properties, contacts, and team-wide email history](.github/readme/crm-company.png)

### [Agents](https://docs.macro.com/product/agents)

Unified team-level memory makes Macro's agent the most knowledgeable "person" at your company — and it takes action on your behalf, not just answers questions.

- Hand a task to a coding agent ([Claude Code](https://docs.macro.com/AI/mcp/overview) and friends) straight from the task view; it opens a branch and reports back.
- Agents see email, messages, tasks, docs, files, and calls — scoped to the same permissions you have.
- Connect your own MCP clients and let them read and write your workspace.

![A Macro task being handed off to a coding agent, with a linked branch](.github/readme/agents-task-handoff.png)

### Also included

- **[Canvas](https://docs.macro.com/product/canvas):** 2D board with embedded @links to tasks, files, and emails, for planning that doesn't fit in a list.
- **[Calls](https://docs.macro.com/product/calls):** recorded, transcribed, and logged to team memory, so decisions made on a call are searchable afterwards.
- **[Pull requests](https://docs.macro.com/integrations/github):** linked to tasks, embeddable in channels, and available to agents.

  
### A few ideas make the blocks work as one system:
 
- **[Bidirectional @linking](https://docs.macro.com/concepts/mentions):** @mention a doc in a message and both know about each other. Your workspace becomes a web of context you can navigate in either direction.
- **[Channel-based permissions](https://docs.macro.com/permissions):** anything you @mention in a channel is automatically shared with its members. Join a channel, gain access; leave, lose it. No permission-request dance.
- **[Unified memory](https://docs.macro.com/product/unified-memory):** agents remember what your whole team is doing across email, messages, tasks, docs, and calls, not just your own chat history. Refreshed nightly.
- **[One inbox](https://docs.macro.com/product/inbox):** emails, channel messages, task assignments, @mentions, and agent responses all land in one place, split into Signal and Noise.
- **Built for speed:** [keyboard-first](https://docs.macro.com/keyboard-shortcuts) everywhere.

### Additional Resources:

- [Getting started](https://docs.macro.com/getting-started): setup and the core workflow
- [Key concepts](https://docs.macro.com/concepts/blocks): blocks, mentions, properties, and permissions
- [Keyboard shortcuts](https://docs.macro.com/keyboard-shortcuts): the complete reference
- [Agents & MCP](https://docs.macro.com/AI/mcp/overview): connect AI clients to your workspace
- [FAQ](https://docs.macro.com/faq): comparisons, licensing, self-hosting, and data questions
- [Changelog](https://docs.macro.com/changelog/introduction): what shipped each month


## Getting started
 
[Sign up](https://macro.com/app) and connect your Gmail or Google Workspace account. Macro runs in any modern browser, with an [iOS app](https://apps.apple.com/us/app/macro-app/id6743133649) for your phone. The [getting started guide](https://docs.macro.com/getting-started) takes you from a fresh account to a working setup in about 15 minutes. Coming from Notion, Slack, Superhuman, or Linear? See [Switch to Macro](https://docs.macro.com/switch-to-macro).
 
## Agents & MCP
 
Your coding agents can use Macro too. Point Claude Code, Codex, or any MCP client at your workspace:
 
```bash
claude mcp add --transport http macro https://mcp-server.macro.com/mcp
```
 
See [MCP setup](https://docs.macro.com/AI/mcp/overview) and [agent recipes](https://docs.macro.com/AI/recipes) for what they can do once connected.

## Repository layout

- `apps/` contains the web/desktop application and product documentation site.
- `services/` contains deployable services, workers, and Lambda handlers.
- `crates/` contains reusable Rust libraries, models, and clients.
- `packages/` contains shared JavaScript and TypeScript packages.
- `docker/`, `tooling/`, `docs/`, and `static_assets/` contain repository support files.

The Cargo and Bun workspaces are rooted at the repository top level. See [Running locally](docs/RUNNING_LOCALLY.md) for setup and development commands.

 
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

<div align="center">
  <a target="_blank" href="https://macro.com/app">
    <img width="2195" height="721" alt="Frame 12" src="https://github.com/user-attachments/assets/61b846b0-0a61-4a65-9f7b-0e605e209d12" />
  </a>
</div>
