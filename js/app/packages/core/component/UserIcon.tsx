import { macroIdToEmail, tryMacroId, useDisplayName } from '@core/user';
import { isOk } from '@core/util/maybeResult';
import Trash from '@phosphor-icons/core/regular/trash.svg?component-solid';
import { commsServiceClient } from '@service-comms/client';
import { createMemo, Match, Show, Switch } from 'solid-js';
import { useSplitLayout } from '../../app/component/split-layout/layout';
import { ProfilePicture } from './ProfilePicture';
import { Tooltip } from './Tooltip';
import { UserTooltip } from './UserTooltip';
import { cn } from '@ui/utils/classname';

export type UserIconProps = {
  isDeleted?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'fill';
  suppressClick?: boolean;
  showTooltip?: boolean;
  // TODO: remove imageUrl. not actively used.
  imageURL?: string;
  fetchUrl?: boolean;
  class?: string;
  rounded?: 'full' | 'md' | 'sm' | 'none';
} & ({ id: string; email?: never } | { email: string; id?: never });

export type SizeClass = {
  container: string;
  icon: string;
  text: string;
};

export function UserIcon(props: UserIconProps) {
  const displayName = createMemo(() => {
    if (!props.id) return () => props.email;
    const [displayName] = useDisplayName(tryMacroId(props.id));
    return displayName;
  });

  const email = createMemo(() => {
    const macroId = props.id && tryMacroId(props.id);
    if (macroId) {
      return macroIdToEmail(macroId);
    }
    if (props.email) return props.email;
  });

  const sizeClasses = createMemo(() => {
    switch (props.size || 'md') {
      case 'xs':
        return {
          container: 'size-4',
          icon: 'w-2 h-2',
          text: 'text-[8px] leading-none',
        };
      case 'sm':
        return {
          container: 'size-6',
          icon: 'w-3 h-3',
          text: 'text-xs leading-none',
        };
      case 'md':
        return {
          container: 'size-8',
          icon: 'w-4 h-4',
          text: 'text-lg leading-none',
        };
      case 'lg':
        return {
          container: 'size-10',
          icon: 'w-5 h-5',
          text: 'text-lg leading-none',
        };
      case 'xl':
        return {
          container: 'size-25',
          icon: 'w-16 h-16',
          text: 'text-[48px] leading-none',
        };
      case 'fill':
        return {
          container: 'w-full h-full @container',
          icon: 'w-full h-full',
          text: 'text-[min(calc(50cqw),3rem)] leading-none',
        };
    }
  });

  const { replaceOrInsertSplit } = useSplitLayout();

  const getOrCreateDm = async () => {
    if (props.id) {
      const result = await commsServiceClient.getOrCreateDirectMessage({
        recipient_id: props.id,
      });
      const channelId = isOk(result) && result[1]?.channel_id;
      if (channelId) {
        replaceOrInsertSplit({
          type: 'channel',
          id: channelId,
        });
      }
    }
  };

  const roundedClass = () => {
    switch (props.rounded ?? 'full') {
      case 'full': return 'rounded-full';
      case 'md': return 'rounded-md';
      case 'sm': return 'rounded-sm';
      case 'none': return '';
    }
  };

  const icon = createMemo(() => (
    <div
      onMouseDown={props.suppressClick ? undefined : getOrCreateDm}
      class={cn(
        'shrink-0 bg-ink-extra-muted text-panel',
        roundedClass(),
        sizeClasses().container,
        props.class
      )}
    >
      <Switch>
        <Match when={props.isDeleted}>
          <div
            class={cn(sizeClasses().container, 'shrink-0 bg-ink-extra-muted/50 items-center', roundedClass())}
          >
            <Trash class={`${sizeClasses().icon} shrink-0`} />
          </div>
        </Match>
        <Match when={props.id} keyed>
          {(id) => <ProfilePicture id={id} sizeClass={sizeClasses()} rounded={props.rounded} />}
        </Match>
        <Match when={!props.id && props.email} keyed>
          {(email) => (
            <ProfilePicture
              id={undefined}
              email={email}
              sizeClass={sizeClasses()}
              rounded={props.rounded}
            />
          )}
        </Match>
      </Switch>
    </div>
  ));

  return (
    <Show
      when={
        props.showTooltip !== false && (displayName().length > 0 || email())
      }
      fallback={icon()}
    >
      <Tooltip
        placement="left"
        class={sizeClasses().container}
        unstyled
        tooltip={(close) => (
          <UserTooltip
            displayName={displayName()() || ''}
            email={email()}
            id={props.id}
            isDeleted={props.isDeleted}
            onClose={close}
          />
        )}
      >
        {icon()}
      </Tooltip>
    </Show>
  );
}
