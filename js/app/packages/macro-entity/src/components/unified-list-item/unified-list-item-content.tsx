import { onKeyDownClick, onKeyUpClick } from '@core/util/click';
import { mergeRefs } from '@solid-primitives/refs';
import {
  type ComponentProps,
  createSignal,
  type FlowComponent,
} from 'solid-js';
import { useUnifiedListItem } from './unified-list-item-root';

type UnifiedListItemContentProps = Omit<
  ComponentProps<'div'>,
  | 'onClick'
  | 'onMouseDown'
  | 'onKeyDown'
  | 'onKeyUp'
  | 'role'
  | 'tabIndex'
  | 'class'
>;

export const UnifiedListItemContent: FlowComponent<
  UnifiedListItemContentProps
> = (props) => {
  const item = useUnifiedListItem();

  const [entityDivRef, setEntityDivRef] = createSignal<HTMLDivElement | null>(
    null
  );
  // The main click handler for the entity row should navigate to an entity
  // without forcing focus back to the source split until after navigation.
  // Certain buttons in the entity need to NOT Navigate AND return focus to
  // the split. Those buttons should have a 'data-blocks-navigation'
  function blocksNavigation(e: PointerEvent | MouseEvent): boolean {
    const { target } = e;
    if (target instanceof Element) {
      const closest = target.closest('[data-blocks-navigation]');
      if (closest && entityDivRef()?.contains(closest)) return true;
    }
    return false;
  }

  return (
    <div
      class="w-full min-w-0 grid flex-1 items-center suppress-css-bracket grid-cols-[2rem_1fr_auto] pr-2"
      onClick={(e) => {
        if (blocksNavigation(e)) return;
        item.onClick?.(e);
      }}
      onMouseDown={(e) => {
        if (blocksNavigation(e)) return;
        e.preventDefault();
      }}
      onKeyDown={onKeyDownClick((e) => item.onClick?.(e))}
      onKeyUp={onKeyUpClick((e) => item.onClick?.(e))}
      role="button"
      tabIndex={0}
      {...props}
      ref={mergeRefs(setEntityDivRef, props.ref)}
    />
  );
};
