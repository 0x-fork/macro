import { createMemo, For, Show } from 'solid-js';
import type { EntityReference } from '../../types';
import { UserIcon } from '@core/component/UserIcon';
import { cn } from '@ui/utils/classname';

type UserEntityPillProps = {
  entities: EntityReference[];
  maxUsers?: number;
};

/**
 * Pill for multiselect user entity properties that shows user avatars in LiveIndicators style
 */
export const UserGroup = (props: UserEntityPillProps) => {
  const max = () => props.maxUsers ?? 3;
  const remaining = createMemo(() => {
    if (props.entities.length <= max()) return undefined;
    return props.entities.length - max();
  });

  const displayEntities = () => props.entities.slice(0, max());

  return (
    <div class="flex items-center shrink-0 w-fit">
      <For each={displayEntities()}>
        {(entity, index) => (
          <div class={cn('rounded-full ring-1 ring-edge-muted overflow-hidden', index() > 0 && '-ml-2')}>
            <UserIcon
              id={entity.entity_id}
              isDeleted={false}
              size="xs"
              suppressClick
              showTooltip={false}
            />
          </div>
        )}
      </For>
      <Show when={remaining()}>
        <div class="-ml-2 z-10 size-4 bg-panel text-ink-muted text-[9px] font-medium rounded-full ring-1 ring-edge-muted flex items-center justify-center">
          +{remaining()}
        </div>
      </Show>
    </div>
  );
};
