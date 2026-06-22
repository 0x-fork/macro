import { UserIcon } from '@core/component/UserIcon';
import { useSplitNavigationHandler } from '@core/util/useSplitNavigationHandler';
import IconRobot from '@phosphor/robot.svg';
import IconX from '@phosphor/x.svg';
import { Avatar, Button } from '@ui';
import { Show } from 'solid-js';
import type { ParticipantsListItemData } from './ParticipantsList';

export function ParticipantsListItem(props: {
  item: ParticipantsListItemData;
  isLast?: boolean;
  currentUserId?: string;
  editable: boolean;
  onClick: () => void | Promise<void>;
  onRemove: () => void;
}) {
  const canRemove = props.editable && props.currentUserId !== props.item.id;

  const navigationHandlers = useSplitNavigationHandler<HTMLButtonElement>(
    async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await props.onClick();
    }
  );

  return (
    <div
      class="flex items-center justify-between gap-2 py-2 px-6 text-sm w-full bg-surface hover:bg-hover"
      classList={{ 'border-b': !props.isLast }}
      style={{ 'border-color': 'var(--b3)' }}
    >
      <button
        {...navigationHandlers}
        type="button"
        class="flex min-w-0 flex-1 items-center gap-3 rounded-xs text-left focus:outline-none"
      >
        <div class="shrink-0">
          <Show
            when={props.item.avatarUrl}
            fallback={
              props.item.role === 'bot' ? (
                <Avatar size="lg">
                  <Avatar.Fallback>
                    <IconRobot class="size-4" />
                  </Avatar.Fallback>
                </Avatar>
              ) : (
                <UserIcon id={props.item.id} size="lg" isDeleted={false} />
              )
            }
          >
            {(avatarUrl) => (
              <Avatar size="lg">
                <Avatar.Image src={avatarUrl()} alt={props.item.displayName} />
                <Avatar.Fallback>
                  <Show
                    when={props.item.role === 'bot'}
                    fallback={props.item.displayName.slice(0, 1)}
                  >
                    <IconRobot class="size-4" />
                  </Show>
                </Avatar.Fallback>
              </Avatar>
            )}
          </Show>
        </div>
        <div class="min-w-0 flex-1">
          <div class="ph-no-capture text-sm font-medium text-ink truncate">
            {props.item.displayName}
          </div>
          <div class="text-xs text-ink-extra-muted">
            {props.item.secondaryText ?? props.item.role}
          </div>
        </div>
      </button>
      <Show when={props.editable}>
        <div class="shrink-0">
          <Button
            label={
              canRemove ? 'Remove participant' : 'Cannot remove participant'
            }
            variant="ghost"
            size="icon-sm"
            disabled={!canRemove}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!canRemove) return;
              props.onRemove();
            }}
          >
            <IconX />
          </Button>
        </div>
      </Show>
    </div>
  );
}
