import { RenderTool } from '@core/component/AI/component/tool/handler';
import {
  useChatContext,
  useChatInputContext,
} from '@core/component/AI/context';
import { useResumeWithToolGrantsMutation } from '@queries/cognition/tool-grants';
import { createMemo, createSignal, Show } from 'solid-js';

/**
 * Renders a tool call that is awaiting the user's permission.
 *
 * The UI is a grayed-out, non-interactive version of the actual tool-call view
 * (the same `RenderTool` used for executed calls) with an accept/reject dialog
 * overlaid — not a generic shield card. Granting or denying resumes the chat
 * through the TanStack `useResumeWithToolGrantsMutation`; the component never
 * calls the service client directly.
 */
export function PermissionRequest(props: {
  id: string;
  name: string;
  json: unknown;
  /** DB id of the assistant message holding this pending call. */
  message_id: string;
}) {
  const chat = useChatContext();
  const input = useChatInputContext();
  const resume = useResumeWithToolGrantsMutation();
  const [resolved, setResolved] = createSignal<'granted' | 'denied'>();

  const isResolved = createMemo(() => resolved() !== undefined);

  const decide = (approved: boolean) => {
    setResolved(approved ? 'granted' : 'denied');
    resume.mutate(
      {
        chatId: chat.chatId(),
        model: input.model(),
        decisions: [{ tool_call_id: props.id, approved }],
      },
      {
        onSuccess: (result) => {
          if ('error' in result) {
            // Revert so the user can retry.
            setResolved(undefined);
            return;
          }
          chat.dispatch({ type: 'stream_connected', stream: result.stream });
        },
        onError: () => setResolved(undefined),
      }
    );
  };

  return (
    <div class="relative">
      {/* The real tool-call view, grayed out and non-interactive until the
          user decides. */}
      <div
        class="pointer-events-none select-none opacity-50"
        aria-hidden={!isResolved()}
      >
        <RenderTool
          tool_id={props.id}
          chat_id={chat.chatId()}
          json={props.json}
          name={props.name}
          message_id={props.message_id}
          part_index={0}
          isComplete={false}
          renderContext={{
            renderContext: {
              isStreaming: false,
              grouped: false,
            },
          }}
        />
      </div>

      <Show when={!isResolved()}>
        <div class="absolute inset-0 flex items-center justify-end gap-2 rounded bg-surface/40 px-3 backdrop-blur-[1px]">
          <span class="mr-auto text-xs text-ink-muted">
            Allow <span class="font-medium text-ink">{props.name}</span>?
          </span>
          <button
            type="button"
            class="rounded bg-accent px-3 py-1 text-xs font-medium text-on-accent transition-opacity hover:opacity-90"
            disabled={resume.isPending}
            onClick={() => decide(true)}
          >
            Allow
          </button>
          <button
            type="button"
            class="rounded border border-edge bg-surface px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-hover"
            disabled={resume.isPending}
            onClick={() => decide(false)}
          >
            Deny
          </button>
        </div>
      </Show>
    </div>
  );
}
