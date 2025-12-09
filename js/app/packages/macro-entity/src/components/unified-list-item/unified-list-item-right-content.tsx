import type { OverrideComponentProps } from '@kobalte/core';
import { type FlowComponent, splitProps } from 'solid-js';

type UnifiedListItemRightContentProps = {};

export const UnifiedListItemRightContent: FlowComponent<
  OverrideComponentProps<'div', UnifiedListItemRightContentProps>
> = (props) => {
  const [self, other] = splitProps(props, ['classList', 'children']);
  return (
    <div class="row-1 ml-2 @md:ml-4 self-center min-w-0 col-3" {...other}>
      <div class="flex flex-row items-center justify-end gap-2 min-w-0">
        {self.children}
      </div>
    </div>
  );
};
