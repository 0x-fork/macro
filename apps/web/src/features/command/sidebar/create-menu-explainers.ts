import { type HotkeyToken, TOKENS } from '@core/hotkey/tokens';

/**
 * Copy for the create menu's hover explainer — the secondary panel that opens
 * beside whichever item is hovered or keyboard-focused.
 *
 * Kept out of `CREATABLE_BLOCKS` (which is shared with the command palette,
 * the mobile dock, and the global hotkey table, all of which show only the
 * terse `description`) so the longer product copy lives in one place.
 */
export type CreateMenuExplainer = {
  /** What the item produces, phrased as the outcome. */
  title: string;
  /** One or two sentences on what the block is for. */
  body: string;
};

/**
 * Keyed by the block's create hotkey token — the only field on a
 * `CreatableBlock` that is unique per item (`blockName` is not: Message and
 * Channel are both `channel`).
 */
export const CREATE_MENU_EXPLAINERS: Partial<
  Record<HotkeyToken, CreateMenuExplainer>
> = {
  [TOKENS.create.email]: {
    title: 'Draft an email',
    body: 'Compose from any of your linked Gmail accounts, with threads syncing both ways. Signal/Noise filtering keeps the inbox quiet, and an agent can draft or send for you.',
  },
  [TOKENS.create.chat]: {
    title: 'Start an agent chat',
    body: 'Ask a question against your whole workspace — email, tasks, docs, calls, and channels. Agents can draft, create tasks, post in channels, and run on a schedule, always bounded by your permissions.',
  },
  [TOKENS.create.note]: {
    title: 'Write a document',
    body: 'Markdown-native, real-time collaborative, and @linked to everything else you work on. Organize docs in folders and add tags to filter them like a database.',
  },
  [TOKENS.create.task]: {
    title: 'Track a piece of work',
    body: 'Just status, priority, and assignee — no extra labels to maintain. Tasks are @mentionable anywhere as live pills, sync bidirectionally with GitHub pull requests, and are readable by AI clients over MCP.',
  },
  [TOKENS.create.snippet]: {
    title: 'Save reusable text',
    body: 'A full markdown document you can drop into anything you write — type ";" in any markdown area to insert it. Edit the snippet and every future insertion picks up the change.',
  },
  [TOKENS.create.message]: {
    title: 'Message someone',
    body: 'Pick people by name or email and send; Macro opens the direct or group conversation for you. Anything you @mention is shared with everyone in the conversation.',
  },
  [TOKENS.create.channel]: {
    title: 'Open a channel',
    body: 'A hub for a topic, project, or team, with threaded replies to keep discussions separate. Anyone can be added by email — people without a Macro account get their notifications by email.',
  },
  [TOKENS.create.canvas]: {
    title: 'Map something out',
    body: 'An infinite board for diagrams and mind maps, with shapes, connectors, and freehand drawing. Place live @mentions of real tasks, docs, emails, and calls right on it.',
  },
  [TOKENS.create.project]: {
    title: 'Organize your files',
    body: 'Group docs, PDFs, images, videos, code files, and canvases in one place. Channel and email attachments land in your workspace automatically, and everything stays searchable.',
  },
  [TOKENS.create.code]: {
    title: 'Add a code file',
    body: 'A syntax-highlighted file that shares, embeds, and @mentions like any other block. Starts out as Python.',
  },
};
