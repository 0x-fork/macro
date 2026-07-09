import CaretDown from '@phosphor/caret-down.svg';
import { Dropdown } from '@ui';
import { createSignal, For, onCleanup } from 'solid-js';
import { MobileDrawer } from './MobileDrawer';

const FIRST_OPTIONS = ['First A', 'First B', 'First C'];
const SECOND_OPTIONS = ['Second A', 'Second B', 'Second C'];

function DebugDropdown(props: {
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  localPortal?: boolean;
  touchOpenOnPointerDown?: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  let suppressNextTriggerClick = false;
  let cleanupTriggerListener: (() => void) | undefined;

  const setTriggerRef = (el: HTMLElement) => {
    cleanupTriggerListener?.();

    const onClickCapture = (event: MouseEvent) => {
      if (!suppressNextTriggerClick) return;

      suppressNextTriggerClick = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    el.addEventListener('click', onClickCapture, true);
    cleanupTriggerListener = () => {
      el.removeEventListener('click', onClickCapture, true);
    };
  };

  onCleanup(() => cleanupTriggerListener?.());

  const onPointerDown = (event: PointerEvent) => {
    if (
      !props.touchOpenOnPointerDown ||
      event.pointerType !== 'touch' ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();
    suppressNextTriggerClick = true;
    setOpen((isOpen) => !isOpen);
  };

  return (
    <Dropdown open={open()} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
      <Dropdown.Trigger
        variant="base"
        ref={props.touchOpenOnPointerDown ? setTriggerRef : undefined}
        // onPointerDown={onPointerDown}
        class="h-11 w-full justify-between rounded-lg px-3 text-sm"
      >
        <span>{props.label}</span>
        <span class="ml-auto text-ink-extra-muted">{props.value}</span>
        <CaretDown class="size-3.5 shrink-0" />
      </Dropdown.Trigger>
      <Dropdown.Content
        class="min-w-56"
        portalScope={props.localPortal ? 'local' : undefined}
      >
        <Dropdown.Group>
          <For each={props.options}>
            {(option) => (
              <Dropdown.Item onSelect={() => props.onSelect(option)}>
                <span class="flex-1 truncate">{option}</span>
              </Dropdown.Item>
            )}
          </For>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
}

export function MobileDropdownDebugDrawer() {
  const [firstValue, setFirstValue] = createSignal(FIRST_OPTIONS[0]);
  const [secondValue, setSecondValue] = createSignal(SECOND_OPTIONS[0]);

  return (
    <MobileDrawer
      side="bottom"
      open
      onOpenChange={() => {}}
      preventScroll={true}
      preventScrollbarShift={true}
      breakPoints={[0.55]}
    >
      <MobileDrawer.Portal>
        <MobileDrawer.Overlay class="fixed inset-0 z-modal-overlay bg-modal-overlay pattern-diagonal-4 pattern-edge-muted" />
        <MobileDrawer.Content
          aria-label="Dropdown debug drawer"
          targetHeight={55}
        >
          <MobileDrawer.Handle />
          <div class="flex flex-col gap-3 px-4 pb-4">
            <MobileDrawer.Label>Dropdown debug</MobileDrawer.Label>
            <MobileDrawer.Section class="flex flex-col gap-2 p-3">
              <DebugDropdown
                label="Stock dropdown"
                value={firstValue()}
                options={FIRST_OPTIONS}
                onSelect={setFirstValue}
              />
              <DebugDropdown
                label="Patched local"
                value={secondValue()}
                options={SECOND_OPTIONS}
                onSelect={setSecondValue}
                // localPortal
                // touchOpenOnPointerDown
              />
            </MobileDrawer.Section>
          </div>
        </MobileDrawer.Content>
      </MobileDrawer.Portal>
    </MobileDrawer>
  );
}
