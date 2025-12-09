import type { OverrideComponentProps } from '@kobalte/core';
import { type FlowComponent, splitProps } from 'solid-js';
import { useUnifiedListItem } from './unified-list-item-root';

type UnifiedListItemMainContentProps = {};

export const UnifiedListItemMainContent: FlowComponent<
  OverrideComponentProps<'div', UnifiedListItemMainContentProps>
> = (props) => {
  const [self, other] = splitProps(props, ['classList']);

  const item = useUnifiedListItem();

  return (
    <div
      class="min-h-10 min-w-[50px] flex flex-row items-center gap-2 col-2"
      classList={{
        grow: item.contentPlacement() === 'bottom-row',
        ...self.classList,
      }}
      {...other}
    >
      {props.children}
    </div>
  );
};
