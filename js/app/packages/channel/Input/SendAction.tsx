import { Show } from 'solid-js';
import { useInput, useInputCommands } from './context';
import PaperPlaneIcon from '@phosphor-icons/core/fill/paper-plane-right-fill.svg?component-solid';
import SpinnerIcon from '@icon/bold/spinner-gap-bold.svg';
import { Button } from '@ui/components/Button';
import { hasSendableInputContent } from './utils/sendable-content';

export function SendAction() {
  const input = useInput();
  const commands = useInputCommands();
  const isBlockedByPending = () => !!input().hasPendingAttachments;
  const isBlockedByEmptyInput = () => !hasSendableInputContent(input());

  return (
    <Button
      tooltip="Send message"
      size="icon-sm"
      disabled={isBlockedByPending() || isBlockedByEmptyInput()}
      onPointerDown={(event) => {
        event.preventDefault();
        void commands.send();
      }}
    >
      <Show
        when={!isBlockedByPending()}
        fallback={<SpinnerIcon class="size-5 animate-spin" />}
      >
        <PaperPlaneIcon class="size-4" />
      </Show>
    </Button>
  );
}
