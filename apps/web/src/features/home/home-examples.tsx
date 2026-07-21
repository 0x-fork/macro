import type { ChatSendInput } from '@core/component/AI/component/input/buildRequest';
import { useChatInputContext } from '@core/component/AI/context';
import { isMobile } from '@core/mobile/isMobile';
import { AnimatedFileMdIcon } from '@icon/wide-fileMd';
import { AnimatedTaskIcon } from '@icon/wide-task';
import TagIcon from '@phosphor/tag.svg';
import XIcon from '@phosphor/x.svg';
import { createSignal, For, type JSX, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { replaceHomeComposerSelection } from './home-composer-selection';
import type { HomePreferences } from './home-prefs';

type HomeExample = {
  icon: (props: { class?: string; triggerAnimation?: boolean }) => JSX.Element;
  title: string;
  prompt: string;
};

const HOME_EXAMPLES: HomeExample[] = [
  {
    icon: TagIcon,
    title: 'Auto-organize my inbox',
    prompt:
      'Categorize and tag recent emails in my inbox. Link me to macro.com/app/settings/tags where I can manage all of my tags.',
  },
  {
    icon: AnimatedTaskIcon,
    title: 'Pull tasks from inbox',
    prompt:
      'Find my most important recent emails and create tasks from them. Link me to macro.com/app/component/tasks where I can see all of my tasks.',
  },
  {
    icon: AnimatedFileMdIcon,
    title: 'Build weekly brief',
    prompt:
      'Review my recent emails, documents, and tasks from the past week. Identify key decisions, open questions, blockers, and next steps, then create a concise weekly briefing document with links to the original sources.',
  },
];

/**
 * Dismissible example-prompt cards. Clicking one loads and runs the prompt in
 * a new chat. Hidden on mobile.
 */
export function HomeExamples(props: {
  preferences: HomePreferences;
  onSend: (request: ChatSendInput) => void | Promise<void>;
}) {
  const input = useChatInputContext();
  const [hovered, setHovered] = createSignal<number | null>(null);
  const [executing, setExecuting] = createSignal(false);

  const executeExample = async (example: HomeExample) => {
    if (executing()) return;

    setExecuting(true);
    replaceHomeComposerSelection(input, example.prompt);
    try {
      await props.onSend({
        content: example.prompt,
        model: input.model(),
        attachments: [],
        toolset: { type: 'all' },
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Show when={!isMobile() && !props.preferences.isDismissed('examples')}>
      <section>
        <div class="mb-2 flex items-center justify-between px-1">
          <span class="text-sm text-ink-muted">Examples</span>
          <button
            type="button"
            class="rounded-md p-1 text-ink-extra-muted transition-colors hover:bg-hover hover:text-ink-muted"
            aria-label="Dismiss examples"
            onClick={() => props.preferences.dismiss('examples')}
          >
            <XIcon class="size-3.5" />
          </button>
        </div>
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <For each={HOME_EXAMPLES}>
            {(example, i) => (
              <button
                type="button"
                class="group flex flex-col gap-1 rounded-xl border border-edge-muted bg-active p-3 text-left transition-colors hover:bg-hover"
                disabled={executing()}
                onClick={() => void executeExample(example)}
                onMouseEnter={() => setHovered(i())}
                onMouseLeave={() =>
                  setHovered((prev) => (prev === i() ? null : prev))
                }
              >
                <div class="flex items-center gap-2">
                  <Dynamic
                    component={example.icon}
                    triggerAnimation={hovered() === i()}
                    class="size-4 shrink-0 text-ink-muted transition-colors group-hover:text-accent"
                  />
                  <span class="text-sm font-medium text-ink">
                    {example.title}
                  </span>
                </div>
              </button>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}
