import type { OverrideComponentProps } from '@kobalte/core';
import {
  type Accessor,
  createContext,
  type FlowComponent,
  onMount,
  splitProps,
  useContext,
} from 'solid-js';

interface UnifiedListItemContextValues {
  highlighted: Accessor<boolean>;
  checked: Accessor<boolean>;
  focused: Accessor<boolean>;
  onClick?: (event: Event) => void;
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
  contentPlacement: Accessor<'middle' | 'bottom-row'>;
}

const UnifiedListItemContext = createContext<UnifiedListItemContextValues>();

export const useUnifiedListItem = () => {
  return useContext(UnifiedListItemContext)!;
};

type UnifiedListItemRootProps = {
  highlighted?: boolean;
  checked?: boolean;
  focused?: boolean;
  onMouseOver?: VoidFunction;
  onContextMenu?: VoidFunction;
  onClick?: (
    event: MouseEvent & {
      target: HTMLDivElement;
      currentTarget: HTMLDivElement;
    }
  ) => void;
  contentPlacement?: 'middle' | 'bottom-row';
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
};

export const UnifiedListItemRoot: FlowComponent<
  OverrideComponentProps<'div', UnifiedListItemRootProps>
> = (props) => {
  const [self, other] = splitProps(props, [
    'highlighted',
    'checked',
    'focused',
    'onMouseOver',
    'onContextMenu',
    'onClick',
    'contentPlacement',
    'onChecked',
  ]);
  const { didCursorMove } = useCursorMove();

  return (
    <UnifiedListItemContext.Provider
      value={{
        highlighted: () => self.highlighted ?? false,
        checked: () => self.checked ?? false,
        focused: () => self.focused ?? false,
        contentPlacement: () => self.contentPlacement ?? 'middle',
        onChecked: self.onChecked,
        onClick: self.onClick,
      }}
    >
      <div
        class="everything-entity relative group/entity"
        classList={{
          'bg-hover/30': self.highlighted && !self.checked,
          'bg-accent/5': self.checked,
          'bracket outline outline-accent/20 outline-offset-[-1px]':
            self.focused,
        }}
        onMouseOver={(e) => {
          if (!didCursorMove(e)) {
            return;
          }
          self.onMouseOver?.();
        }}
        onContextMenu={() => {
          self.onContextMenu?.();
        }}
        {...other}
      >
        {props.children}
      </div>
    </UnifiedListItemContext.Provider>
  );
};

let lastMouseX: number | null = null;
let lastMouseY: number | null = null;
let initialMouseMove: boolean = false;
let cursorInit = true;

const useCursorMove = () => {
  const didCursorMove = (event: MouseEvent) => {
    if (!initialMouseMove) return;
    const { clientX, clientY } = event;
    // If the mouse hasn't moved, ignore the event
    if (clientX === lastMouseX && clientY === lastMouseY) {
      return false;
    }

    // Update the last known position
    lastMouseX = clientX;
    lastMouseY = clientY;

    return true;
  };

  const moveEvent = (event: MouseEvent) => {
    const { clientX, clientY } = event;
    initialMouseMove = true;

    setTimeout(() => {
      lastMouseX = clientX;
      lastMouseY = clientY;
    });
  };
  onMount(() => {
    if (!cursorInit) {
      return;
    }
    cursorInit = false;
    document.addEventListener('mousemove', moveEvent, { capture: true });
  });
  return { didCursorMove };
};
