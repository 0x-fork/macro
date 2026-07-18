import type { SoupEntityItem } from '@app/features/soup-list';
import { useLongPress } from '@components/app/mobile/use-long-press';
import { hapticImpact } from '@core/mobile/haptics';
import type { EntityData } from '@entity';
import type { Accessor, ParentProps } from 'solid-js';
import { onCleanup, onMount } from 'solid-js';
import { SoupEntityContextMenu } from './soup-entity-context-menu';

/** Adds shared context-menu and long-press behavior around a view row. */
export function SoupEntityRow(
  props: ParentProps<{
    item: SoupEntityItem;
    selectedEntities: Accessor<EntityData[]>;
    isSelected: Accessor<boolean>;
    onOpen: () => void;
    onLongPress: () => void;
  }>
) {
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

  return (
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
}
