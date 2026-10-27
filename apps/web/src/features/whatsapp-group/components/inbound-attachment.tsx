import SpinnerIcon from '@phosphor/spinner.svg';
import WarningIcon from '@phosphor/warning-circle.svg';
import { Match, Switch } from 'solid-js';

/**
 * A WhatsApp file that isn't a Macro document yet (still importing, failed,
 * or of a kind Macro can't keep), or one whose file can't be fetched. Every state is the same height, so the
 * channel doesn't jump when it resolves.
 */
export function InboundAttachmentPlaceholder(props: {
  state: 'loading' | 'unavailable' | 'unsupported';
  fileName: string;
}) {
  return (
    <div
      class="flex h-12 max-w-sm items-center gap-2 rounded-lg border border-edge-muted px-3 text-sm text-ink-muted"
      data-linked-inbound-attachment={props.state}
    >
      <Switch>
        <Match when={props.state === 'loading'}>
          <SpinnerIcon
            class="size-4 shrink-0 animate-spin"
            aria-hidden="true"
          />
          <span role="status" class="min-w-0 truncate">
            Loading {props.fileName}…
          </span>
        </Match>
        <Match when={props.state === 'unavailable'}>
          <WarningIcon class="size-4 shrink-0" aria-hidden="true" />
          <span class="min-w-0 truncate">
            Attachment unavailable: {props.fileName}
          </span>
        </Match>
        <Match when={props.state === 'unsupported'}>
          <WarningIcon class="size-4 shrink-0" aria-hidden="true" />
          <span class="min-w-0 truncate">
            {props.fileName} can't be shown in Macro
          </span>
        </Match>
      </Switch>
    </div>
  );
}
