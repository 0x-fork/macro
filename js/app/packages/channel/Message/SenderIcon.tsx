import { useSplitLayout } from '@app/component/split-layout/layout';
import { UserIcon } from '@core/component/UserIcon';
import { ENABLE_CONTACT_BLOCK } from '@core/constant/featureFlags';
import { macroIdToEmail, tryMacroId } from '@core/user';
import { useSplitNavigationHandler } from '@core/util/useSplitNavigationHandler';
import { cn } from '@ui';
import { useMessage } from './context';

type SenderIconProps = {
  class?: string;
  hidden?: boolean;
};

export function SenderIcon(props: SenderIconProps) {
  const message = useMessage();
  const { insertSplit } = useSplitLayout();

  const navigationHandlers = useSplitNavigationHandler<HTMLButtonElement>(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const senderId = message().sender_id;
      const macroId = tryMacroId(senderId);
      const contactBlockId = macroId ? macroIdToEmail(macroId) : senderId;
      insertSplit({
        type: 'contact',
        id: encodeURIComponent(contactBlockId),
      });
    }
  );

  if (!ENABLE_CONTACT_BLOCK) {
    return (
      <div
        class={cn('shrink-0 size-(--user-icon-width)', props.class, {
          invisible: props.hidden,
        })}
        aria-hidden={props.hidden ? 'true' : undefined}
      >
        {!props.hidden && <UserIcon id={message().sender_id} size="fill" />}
      </div>
    );
  }

  if (props.hidden) {
    return (
      <div
        class={cn('shrink-0 size-(--user-icon-width) invisible', props.class)}
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      type="button"
      {...navigationHandlers}
      class={cn(
        'shrink-0 size-(--user-icon-width) rounded-full focus:outline-none',
        props.class
      )}
    >
      <UserIcon id={message().sender_id} size="fill" suppressClick />
    </button>
  );
}
