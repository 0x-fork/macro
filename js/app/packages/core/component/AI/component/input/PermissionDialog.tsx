import { RenderTool } from '@core/component/AI/component/tool/handler';
import { McpToolCall } from '@core/component/AI/component/tool/McpToolCall';
import { useChatContext } from '@core/component/AI/context';
import type { UnresolvedCall } from '@core/component/AI/state/chatState';
import type { AssistantMessagePart } from '@core/component/AI/types';
import { Button, Surface } from '@ui';
import { createMemo, createSignal, Match, Show, Switch } from 'solid-js';

export type ResolveDecision =
  | { kind: 'accept'; callId: string }
  | { kind: 'deny'; callId: string };

export type PermissionDialogProps = {
  /** Accept the current (first pending) tool call. */
  onAccept: () => Promise<void> | void;
  /** Deny the current (first pending) tool call. */
  onDeny: () => Promise<void> | void;
  /** Cancel all pending calls. */
  onCancel: () => Promise<void> | void;
};

/**
 * Permission dialog that replaces the chat input box while the chat's derived
 * chain state is suspended. It handles ONE tool at a time — the first pending
 * call. Accept / deny resolve just that call; the backend re-derives the chain
 * and the next pending call (if any) appears here automatically.
 *
 * Layout: header (`Allow Macro to run <toolName>`), the tool-call view itself
 * (the same renderer used in the message list), then Accept / Deny / Cancel.
 * The controller owns the resulting state transition — this component only
 * collects the user's intent and calls back.
 */
export function PermissionDialog(props: PermissionDialogProps) {
  const chat = useChatContext();
  const [busy, setBusy] = createSignal(false);

  // The current call to resolve: the first pending call from the exposed
  // phase's owned message-chain (single source of truth). Present only when
  // idle ∧ suspended.
  const currentCall = createMemo<UnresolvedCall | undefined>(() => {
    const phase = chat.phase();
    return phase.type === 'idle' && phase.messageChain.type === 'suspended'
      ? phase.messageChain.unresolved[0]
      : undefined;
  });

  // The full tool-call part (with `json`) for the current call, looked up from
  // the last assistant message — `UnresolvedCall` carries only `{id, name}`.
  const currentPart = createMemo<AssistantMessagePart | undefined>(() => {
    const call = currentCall();
    if (!call) return undefined;
    const msgs = chat.messages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      const content = msgs[i].content;
      if (msgs[i].role !== 'assistant' || typeof content === 'string') continue;
      const part = content.find(
        (p) =>
          (p.type === 'toolCall' || p.type === 'mcpToolCall') &&
          p.id === call.id
      );
      if (part) return part;
    }
    return undefined;
  });

  const run = (action: () => Promise<void> | void) => async () => {
    if (busy()) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const accept = run(() => props.onAccept());
  const deny = run(() => props.onDeny());
  const cancel = run(() => props.onCancel());

  return (
    <Show when={currentCall()} keyed>
      {(call) => (
        <Surface class="flex w-full flex-col gap-3 rounded-xl border border-edge-muted p-3">
          <div class="text-sm text-ink">
            Allow Macro to run <span class="font-medium">{call.name}</span>
          </div>

          <Switch
            fallback={
              <div class="rounded-lg border border-edge-muted px-3 py-2 text-xs text-ink-extra-muted">
                {call.name}
              </div>
            }
          >
            <Match when={currentPart()?.type === 'toolCall'}>
              {(() => {
                const part = () =>
                  currentPart() as Extract<
                    AssistantMessagePart,
                    { type: 'toolCall' }
                  >;
                return (
                  <RenderTool
                    tool_id={part().id}
                    chat_id={chat.chatId()}
                    json={part().json}
                    name={part().name}
                    unresolved
                    message_id=""
                    part_index={0}
                    isComplete={false}
                    renderContext={{
                      renderContext: {
                        isStreaming: false,
                        grouped: false,
                      },
                    }}
                  />
                );
              })()}
            </Match>
            <Match when={currentPart()?.type === 'mcpToolCall'}>
              {(() => {
                const part = () =>
                  currentPart() as Extract<
                    AssistantMessagePart,
                    { type: 'mcpToolCall' }
                  >;
                return (
                  <McpToolCall
                    name={part().name}
                    service={part().service}
                    display_name={part().display_name ?? undefined}
                    isComplete={false}
                    renderContext={{
                      renderContext: {
                        isStreaming: false,
                        grouped: false,
                      },
                    }}
                  />
                );
              })()}
            </Match>
          </Switch>

          <div class="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy()}
              onClick={cancel}
            >
              Cancel
            </Button>
            <Button size="sm" variant="danger" disabled={busy()} onClick={deny}>
              Deny
            </Button>
            <Button size="sm" variant="cta" disabled={busy()} onClick={accept}>
              Accept
            </Button>
          </div>
        </Surface>
      )}
    </Show>
  );
}
