import type { SoupEntityItem } from '@app/features/soup-list';
import { SwipableRow } from '@components/app/mobile/SwipableRow';
import { useLongPress } from '@components/app/mobile/use-long-press';
import { hapticImpact } from '@core/mobile/haptics';
import { isMobile } from '@core/mobile/isMobile';
import type { EntityData } from '@entity';
import CheckCircleIcon from '@phosphor/check-circle.svg';
import HeartIcon from '@phosphor/heart.svg';
import TrashIcon from '@phosphor/trash.svg';
import type { Accessor, ParentProps } from 'solid-js';
import { Match, onCleanup, onMount, Switch } from 'solid-js';
import { useSoupEntityActions } from '../actions/use-soup-entity-actions';
import { SoupEntityContextMenu } from './soup-entity-context-menu';

/** Adds shared context-menu, long-press, and swipe wrappers around a view row. */
export function SoupEntityRow(
  props: ParentProps<{
    item: SoupEntityItem;
    selectedEntities: Accessor<EntityData[]>;
    isSelected: Accessor<boolean>;
    onOpen: () => void;
    onLongPress: () => void;
  }>
) {
  const entityActions = useSoupEntityActions();
  const { longPressHandlers, consumeLongPress } = useLongPress({
    onLongPress: () => {
      hapticImpact('light');
      props.onLongPress();
    },
  });
  let container: HTMLDivElement | undefined;
  onMount(() => {
    const captureClick = (event: MouseEvent) => {
      consumeLongPress(event);
    };
    container?.addEventListener('click', captureClick, { capture: true });
    onCleanup(() =>
      container?.removeEventListener('click', captureClick, { capture: true })
    );
  });

  const rendered = (
    <SoupEntityContextMenu
      entity={props.item.entity}
      selectedEntities={props.selectedEntities}
      isSelected={props.isSelected}
      onOpen={props.onOpen}
    >
      <div ref={container} class="size-full" {...longPressHandlers}>
        {props.children}
      </div>
    </SoupEntityContextMenu>
  );
  const rowActions = entityActions.build([props.item.entity]);
  const swipeRight =
    rowActions.find((action) => action.id === 'mark-done') ??
    rowActions.find((action) => action.id === 'favorite');
  const remove = rowActions.find((action) => action.id === 'delete');

  return (
    <Switch>
      <Match when={!isMobile()}>{rendered}</Match>
      <Match when={true}>
        <SwipableRow
          id={props.item.id}
          rowBgClass="bg-panel"
          onSwipeRight={swipeRight ? () => void swipeRight.run() : undefined}
          onSwipeLeft={remove ? () => void remove.run() : undefined}
          swipeRightRevealedComponent={
            swipeRight?.id === 'mark-done' ? (
              <CheckCircleIcon class="size-5 text-ink" />
            ) : swipeRight ? (
              <HeartIcon class="size-5 text-ink" />
            ) : undefined
          }
          swipeLeftRevealedComponent={
            remove ? <TrashIcon class="size-5 text-failure-ink" /> : undefined
          }
          swipeRightColor="bg-success-surface"
          swipeLeftColor="bg-failure-surface"
        >
          {rendered}
        </SwipableRow>
      </Match>
    </Switch>
  );
}
