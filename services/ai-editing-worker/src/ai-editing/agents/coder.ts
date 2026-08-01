import { generateText, hasToolCall, type LanguageModel, stepCountIs } from 'ai';
import type { LexicalSession } from '../ai-toolkit';
import API_COMPLETE from '../prompts/API_COMPLETE.md';
import CODER from '../prompts/CODER.md';
import SHARED from '../prompts/SHARED.md';
import {
  createImBlockedTool,
  createReadDocumentTool,
  createRunCodeTool,
} from '../tools';
import { buildPrompt } from './coder-prompt';
import { cachedPrompt, EDIT_PROVIDER_OPTIONS } from './model-options';
import type { RunTaskDeps } from './types';

export type { RunTaskDeps } from './types';

export const CHILD_SYSTEM = `${SHARED}\n${CODER}\n${API_COMPLETE}`;

/** One writer: carry out a single edit instruction via the `editor` surface. */
export async function coder(
  session: LexicalSession,
  task: string,
  model: LanguageModel,
  deps: RunTaskDeps
) {
  return generateText({
    model,
    // Stop on the step cap OR the moment the writer declares itself blocked.
    // Cap allows headroom for larger multi-part tasks and a few error retries.
    stopWhen: [stepCountIs(7), hasToolCall('reportBlocked')],
    system: CHILD_SYSTEM,
    // System, tools, and task/context are fixed for this coder's whole run;
    // one cache breakpoint on the opening message covers all of them.
    messages: cachedPrompt(buildPrompt(task, deps.context, deps.request)),
    tools: {
      runCode: createRunCodeTool({
        session: session,
        doc: deps.doc,
        awarenessSource: deps.awarenessSource,
        params: deps.params,
        typingAnimations: deps.typingAnimations,
        sleep: deps.sleep,
        runner: deps.runner,
        onOps: deps.onOps,
        onRunCode: deps.onRunCode,
        span: deps.span,
      }),
      // `readDocument` returns the whole document. When the coder's window
      // already IS the whole document the call can only return what it was
      // given, yet coders reliably make it anyway — costing a full model round
      // trip and permanently adding a duplicate copy to their history. Withhold
      // the tool rather than asking the prompt to discourage it.
      ...(deps.contextIsWholeDocument
        ? {}
        : { readDocument: createReadDocumentTool({ session }) }),
      reportBlocked: createImBlockedTool(
        deps.contextIsWholeDocument
          ? 'Call this instead of guessing when you cannot do the edit. Your context already contains the entire document.'
          : 'Call this instead of guessing when you cannot do the edit -- but only after `readDocument` failed to surface what you need.',
        false
      ),
    },
    providerOptions: EDIT_PROVIDER_OPTIONS,
    abortSignal: deps.signal,
  });
}
