import SparkleIcon from '@phosphor/sparkle.svg';
import { cognitionApiServiceClient } from '@service-cognition/client';
import { createResource, For, Match, Show, Switch } from 'solid-js';

type SuggestedAction = {
  label: string;
  prompt: string;
};

type SuggestedActionsResult = {
  actions: SuggestedAction[];
};

const SUGGESTED_ACTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['actions'],
  properties: {
    actions: {
      type: 'array',
      minItems: 3,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'prompt'],
        properties: {
          label: {
            type: 'string',
            description: 'A short button label, ideally 2-5 words.',
          },
          prompt: {
            type: 'string',
            description:
              'The exact prompt to put into the AI input when selected.',
          },
        },
      },
    },
  },
} as const;

function isSuggestedAction(value: unknown): value is SuggestedAction {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SuggestedAction>;
  return (
    typeof candidate.label === 'string' &&
    candidate.label.trim().length > 0 &&
    typeof candidate.prompt === 'string' &&
    candidate.prompt.trim().length > 0
  );
}

function parseSuggestedActions(value: unknown): SuggestedAction[] {
  if (typeof value !== 'object' || value === null) return [];
  const actions = (value as Partial<SuggestedActionsResult>).actions;
  if (!Array.isArray(actions)) return [];
  return actions.filter(isSuggestedAction).slice(0, 4);
}

async function fetchSuggestedActions(): Promise<SuggestedAction[]> {
  const response = await cognitionApiServiceClient.structuredCompletion({
    model: 'fast',
    toolset: { type: 'all' },
    output_schema: {
      name: 'home_suggested_ai_actions',
      description: 'Suggested actions the user can ask the AI to perform.',
      schema: SUGGESTED_ACTIONS_SCHEMA,
    },
    prompt: `Generate suggested actions for the current user to ask the AI from the Home screen.

Use the available tools to understand the user's recent and relevant activity across Macro: channels, emails, tasks, calls, documents, chats, projects, and other workspace entities.

Return only actions that are likely useful and grounded in that activity. Prefer actions that help the user catch up, summarize, prioritize, draft replies, plan follow-ups, or continue work. Do not invent specific facts, names, meetings, channels, documents, or deadlines that you cannot verify from context.

Each action should be directly usable as a chat prompt. Make labels concise and prompts specific enough for the AI to act on.`,
    additional_instructions:
      'Avoid generic suggestions unless there is not enough recent context. Do not suggest destructive actions. Do not mention that tools were used.',
  });

  if (response.isErr()) {
    console.error('Failed to load home suggested actions', response.error);
    return [];
  }

  return parseSuggestedActions(response.value.result);
}

export function HomeSuggestedActions(props: {
  onSelect: (prompt: string) => void;
}) {
  const [actions] = createResource(fetchSuggestedActions);

  return (
    <Switch>
      <Match when={actions.loading}>
        <div class="mt-3 flex flex-wrap justify-center gap-2 px-2">
          <For each={[0, 1, 2]}>
            {() => (
              <div class="skeleton-shimmer h-6 w-32 rounded-full bg-hover" />
            )}
          </For>
        </div>
      </Match>
      <Match when={(actions() ?? []).length > 0}>
        <div class="mt-3 flex flex-wrap justify-center gap-2 px-2">
          <For each={actions()}>
            {(action) => (
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface px-2 py-1 text-xs text-ink-muted shadow-sm transition hover:bg-hover hover:text-ink"
                onClick={() => props.onSelect(action.prompt)}
              >
                <SparkleIcon class="size-3 shrink-0" />
                <span>{action.label}</span>
              </button>
            )}
          </For>
        </div>
      </Match>
      <Match when={actions.error}>
        <Show when={false}>{String(actions.error)}</Show>
      </Match>
    </Switch>
  );
}
