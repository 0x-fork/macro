import { UserIcon } from '@core/component/UserIcon';
import { cn } from '@ui';
import { Show } from 'solid-js';
import { MultiSelectCheckbox } from '../../components/MultiSelectCheckbox';
import { UnreadIndicator } from '../../components/UnreadIndicator';
import { Entity } from '../../entity';
import { SearchContent } from '../../extractors-search/search-content';
import { SearchSender } from '../../extractors-search/search-sender';
import {
  isChannelEntity,
  isChannelMessageEntity,
  isEmailEntity,
  isTaskEntity,
} from '../../types/entity';
import { isSearchEntity } from '../../types/search';
import { EmailInboxChip } from './email';
import { type LayoutProps, useListLayout } from './shared';

export function NarrowLayout(props: LayoutProps) {
  const layout = useListLayout();
  const compact = () => layout?.narrowDensity() === 'compact';

  return (
    <Entity.Layout
      class="w-full gap-x-2 items-center text-sm px-2 grid"
      style={{
        'grid-template-columns': compact()
          ? 'auto 1fr'
          : 'auto 1fr max-content',
        'grid-template-rows': compact() ? '26px' : '44px',
        'grid-template-areas': compact()
          ? '"indicator title"'
          : '"indicator title timestamp"',
      }}
    >
      <Entity.Slot
        placement="indicator"
        class={cn('relative', compact() ? 'self-center' : 'self-start pt-3')}
      >
        <Show when={!props.hideCheckbox}>
          <div
            class={cn('w-0 opacity-0 overflow-hidden', {
              'w-6 opacity-100': props.checked,
            })}
          >
            <MultiSelectCheckbox
              checked={props.checked}
              onChecked={props.onChecked}
            />
          </div>
        </Show>
      </Entity.Slot>

      <Entity.Slot
        placement="title"
        class={cn(
          'ph-no-capture flex items-center gap-2 truncate',
          compact() ? 'font-medium text-[13px]' : 'font-semibold'
        )}
      >
        <Show when={props.unread}>
          <UnreadIndicator active />
        </Show>
        <div class="size-4 shrink-0">
          <Entity.Icon entity={props.entity} streamState={props.streamState} />
        </div>
        <Show
          when={isChannelMessageEntity(props.entity) && props.entity}
          fallback={<Entity.Title entity={props.entity} />}
        >
          {(entity) => {
            const hit = () => {
              const e = entity();
              return isSearchEntity(e)
                ? e.search.contentHitData?.[0]
                : undefined;
            };
            return (
              <span class="flex items-center gap-1 min-w-0 truncate">
                <span class="shrink-0 text-ink-muted text-xs whitespace-nowrap">
                  {entity().channelName}
                </span>
                <Show when={entity().senderId}>
                  {(id) => <UserIcon id={id()} size="sm" />}
                </Show>
                <Show when={hit()}>
                  {(h) => (
                    <span class="shrink-0 text-ink-extra-muted text-xs whitespace-nowrap">
                      <SearchSender hit={h()} />
                    </span>
                  )}
                </Show>
                <span class="text-ink/50 font-normal truncate min-w-0">
                  <Show when={hit()} fallback={entity().content}>
                    {(h) => <SearchContent hit={h()} singleLine />}
                  </Show>
                </span>
              </span>
            );
          }}
        </Show>
        <Show when={isEmailEntity(props.entity) && props.entity}>
          {(entity) => <EmailInboxChip entity={entity()} class="ml-auto" />}
        </Show>
      </Entity.Slot>

      <Show
        when={
          !compact() &&
          !props.hasNotifications &&
          !(isChannelEntity(props.entity) && isSearchEntity(props.entity))
        }
      >
        <Entity.Slot
          placement="timestamp"
          class="text-xs text-right text-ink-extra-muted font-light"
        >
          <Show
            when={!isTaskEntity(props.entity)}
            fallback={
              <Entity.Properties
                entity={props.entity}
                maxUserStackUsers={0}
                showCaret={false}
              />
            }
          >
            <Entity.Timestamp entity={props.entity} />
          </Show>
        </Entity.Slot>
      </Show>
    </Entity.Layout>
  );
}
