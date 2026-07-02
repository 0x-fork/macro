/**
 * Identity for the first-party "Macro" system bot. Mirrors
 * `bot_id::MACRO_AI_BOT_ID` on the backend. Macro is a global system bot
 * available in every channel; mentioning it triggers an AI reply in a thread.
 */
export const MACRO_AGENT_BOT_ID = '00000000-0000-0000-0000-00000000a1a1';

/** Display name for Macro. */
export const MACRO_AGENT_NAME = 'Macro';

/** Handle used to find Macro in the mention typeahead (`@macro`). */
export const MACRO_AGENT_HANDLE = 'macro';

/**
 * Identity for the "TaskAgent" mention shorthand. Mirrors
 * `bot_id::TASK_AGENT_BOT_ID` on the backend. Mentioning it asks Macro to
 * create a task from the message and assign it; replies still come from Macro.
 */
export const TASK_AGENT_BOT_ID = '00000000-0000-0000-0000-00000000a1a2';

/** Display name for the TaskAgent shorthand. */
export const TASK_AGENT_NAME = 'TaskAgent';

/** Handle used to find TaskAgent in the mention typeahead (`@taskagent`). */
export const TASK_AGENT_HANDLE = 'taskagent';

function bareId(id: string): string {
  return id.startsWith('bot|') ? id.slice('bot|'.length) : id;
}

/**
 * Whether an id refers to the Macro bot. Accepts both the bare UUID and
 * the `bot|<uuid>` participant/sender form.
 */
export function isMacroAgentId(id: string | undefined): boolean {
  if (!id) return false;
  return bareId(id) === MACRO_AGENT_BOT_ID;
}

/**
 * Whether an id refers to the TaskAgent shorthand. Accepts both the bare UUID
 * and the `bot|<uuid>` participant/sender form.
 */
export function isTaskAgentId(id: string | undefined): boolean {
  if (!id) return false;
  return bareId(id) === TASK_AGENT_BOT_ID;
}

/**
 * Whether an id refers to a first-party agent surfaced through the mention UI
 * (Macro or TaskAgent).
 */
export function isAgentBotId(id: string | undefined): boolean {
  return isMacroAgentId(id) || isTaskAgentId(id);
}
