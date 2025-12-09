import CheckIcon from '@icon/regular/check.svg';
import { type ParentComponent, Show } from 'solid-js';
import { useUnifiedListItem } from './unified-list-item-root';

export const UnifiedListItemCheckbox: ParentComponent = (props) => {
  const item = useUnifiedListItem();
  return (
    <button
      type="button"
      class="col-1 size-full relative group/button flex items-center justify-center bracket-never"
      onClick={(e) => {
        item.onChecked?.(!item.checked(), e.shiftKey);
      }}
      data-blocks-navigation
    >
      <div
        class="size-4 p-0.5 flex items-center justify-center rounded-xs group-hover/button:border-accent group-hover/button:border pointer-events-none"
        classList={{
          'ring ring-edge-muted': item.focused(),
          'bg-panel': !item.checked() && item.focused(),
          'bg-accent border border-accent': item.checked(),
        }}
      >
        <Show when={item.checked()}>
          <CheckIcon class="w-full h-full text-panel" />
        </Show>
      </div>
      {props.children}
    </button>
  );
};
