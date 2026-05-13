import { useSplitLayout } from '@app/component/split-layout/layout';
import { ENABLE_CONTACT_BLOCK } from '@core/constant/featureFlags';
import { macroIdToEmail, tryMacroId, useDisplayName } from '@core/user';
import { useSplitNavigationHandler } from '@core/util/useSplitNavigationHandler';
import { cn } from '@ui';
import { Show } from 'solid-js';
import { useMessage } from './context';

type SenderNameProps = {
  class?: string;
  hidden?: boolean;
};

export function SenderName(props: SenderNameProps) {
  const message = useMessage();
  const macroId = () => tryMacroId(message().sender_id);
  const [displayName] = useDisplayName(macroId());
  const { insertSplit } = useSplitLayout();

  const navigationHandlers = useSplitNavigationHandler<HTMLButtonElement>(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const senderId = message().sender_id;
      const macro = tryMacroId(senderId);
      const contactBlockId = macro ? macroIdToEmail(macro) : senderId;
      insertSplit({
        type: 'contact',
        id: encodeURIComponent(contactBlockId),
      });
    }
  );

  return (
    <Show when={!props.hidden}>
      <Show
        when={ENABLE_CONTACT_BLOCK}
        fallback={
          <span class={cn('text-sm font-medium truncate', props.class)}>
            {displayName()}
          </span>
        }
      >
        <button
          type="button"
          {...navigationHandlers}
          class={cn(
            'text-sm font-medium truncate text-left hover:underline focus:outline-none cursor-pointer',
            props.class
          )}
        >
          {displayName()}
        </button>
      </Show>
    </Show>
  );
}
