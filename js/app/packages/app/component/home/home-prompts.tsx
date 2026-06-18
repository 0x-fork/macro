import GoogleIcon from '@icon/macro-google.svg';
import GithubIcon from '@icon/mcp-github.svg';
import { useAddInboxFlow } from '@core/email-link';
import { useEmailLinksQuery } from '@queries/email/link';
import { authServiceClient } from '@service-auth/client';
import { type Component, createResource, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';

type GithubStatus = 'linked' | 'unlinked' | 'reauthentication_required';

/** Small pill-shaped button used to surface a one-click connect action. */
function ConnectBubble(props: {
  icon: Component<{ class?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="inline-flex items-center gap-1.5 rounded-full border border-edge-muted bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-hover"
    >
      <Dynamic component={props.icon} class="size-3.5" />
      {props.label}
    </button>
  );
}

/**
 * Connect prompts shown beneath the home input box. When the user has a single
 * email connected we nudge them to link a personal and another work inbox, and
 * when GitHub is unlinked we offer to connect it. Below the bubbles sits a faded
 * explainer with a "What do you know about me?" link that drops that prompt into
 * the chat input via `onAskMemory`.
 */
export function HomePrompts(props: { onAskMemory: (text: string) => void }) {
  const linksQuery = useEmailLinksQuery();
  const addInbox = useAddInboxFlow();

  const [githubStatus] = createResource(async (): Promise<GithubStatus> => {
    const response = await authServiceClient.checkGithubLinkStatus();
    if (response.isOk()) {
      return response.value.reauthentication_required
        ? 'reauthentication_required'
        : 'linked';
    }
    const needsReauth = response.error.some(
      (error) => error.code === 'REAUTHENTICATION_REQUIRED'
    );
    return needsReauth ? 'reauthentication_required' : 'unlinked';
  });

  const showEmailBubbles = () => linksQuery.data?.links.length === 1;
  const showGithubBubble = () => githubStatus() === 'unlinked';

  const connectGithub = async () => {
    const url = await authServiceClient.initGithubLink(window.location.href);
    if (url.isOk()) {
      window.location.href = url.value;
    }
  };

  const MEMORY_PROMPT = 'What do you know about me?';

  return (
    <div class="flex flex-col items-center gap-3 pt-1">
      <Show when={showEmailBubbles() || showGithubBubble()}>
        <div class="flex flex-wrap items-center justify-center gap-2">
          <Show when={showEmailBubbles()}>
            <ConnectBubble
              icon={GoogleIcon}
              label="Connect your personal email"
              onClick={() => void addInbox()}
            />
            <ConnectBubble
              icon={GoogleIcon}
              label="Connect another work email"
              onClick={() => void addInbox()}
            />
          </Show>
          <Show when={showGithubBubble()}>
            <ConnectBubble
              icon={GithubIcon}
              label="Connect your GitHub"
              onClick={() => void connectGithub()}
            />
          </Show>
        </div>
      </Show>

      <p class="max-w-xl text-balance text-center text-xs text-ink-muted">
        Macro develops unified memory from your email messages, docs, tasks,
        agents, and connected MCPs. Ask,{' '}
        <button
          type="button"
          class="text-ink underline underline-offset-2 transition-colors hover:text-accent"
          onClick={() => props.onAskMemory(MEMORY_PROMPT)}
        >
          {MEMORY_PROMPT}
        </button>{' '}
        to see your memory.
      </p>
    </div>
  );
}
