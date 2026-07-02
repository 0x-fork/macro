import CaretDownIcon from '@phosphor/caret-down.svg';
import DotsIcon from '@phosphor/dots-three.svg';
import { cn, Dropdown, NavRow } from '@ui';
import { createSignal, For, type JSX, onCleanup, Show } from 'solid-js';

export type CollapsibleSidebarSectionItem = {
  id: string;
  visible: () => JSX.Element;
  dropdown: () => JSX.Element;
};

export function CollapsibleSidebarSection(props: {
  label: string;
  items: readonly CollapsibleSidebarSectionItem[];
  visibleCount: number;
  dropdownMax?: number;
  dropdownFooter?: () => JSX.Element;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDropdownOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);
  let openChangeTimer: ReturnType<typeof setTimeout> | undefined;
  const visibleItems = () => props.items.slice(0, props.visibleCount);
  const overflowItems = () => {
    const items = props.items.slice(props.visibleCount);
    return props.dropdownMax === undefined
      ? items
      : items.slice(0, props.dropdownMax);
  };

  onCleanup(() => {
    if (openChangeTimer !== undefined) {
      clearTimeout(openChangeTimer);
    }
  });

  const notifyOpenChange = (next: boolean) => {
    props.onOpenChange?.(next);
    if (openChangeTimer !== undefined) {
      clearTimeout(openChangeTimer);
    }
    openChangeTimer = setTimeout(() => {
      openChangeTimer = undefined;
      props.onOpenChange?.(next);
    }, 130);
  };

  const toggleOpen = () => {
    const next = !open();
    setOpen(next);
    notifyOpenChange(next);
  };

  return (
    <section class="w-full flex flex-col">
      <header class="pt-1">
        <button
          type="button"
          class="group/section flex h-7 w-full items-center justify-between rounded-md px-2 text-left text-xs font-medium text-ink-extra-muted/60 transition-colors hover:bg-ink/3 hover:text-ink-muted"
          aria-expanded={open()}
          onClick={toggleOpen}
        >
          <span class="min-w-0 truncate">{props.label}</span>
          <CaretDownIcon
            class={cn(
              'size-3 shrink-0 transition-transform duration-[120ms] ease-in-out',
              !open() && '-rotate-90'
            )}
          />
        </button>
      </header>
      <div
        class={cn('grid overflow-hidden', !open() && 'pointer-events-none')}
        aria-hidden={!open()}
        style={{
          'grid-template-rows': open() ? '1fr' : '0fr',
          opacity: open() ? '1' : '0',
          visibility: open() ? 'visible' : 'hidden',
          transition: open()
            ? 'grid-template-rows 120ms ease-in-out, opacity 120ms ease-in-out, visibility 0ms linear 0ms'
            : 'grid-template-rows 120ms ease-in-out, opacity 120ms ease-in-out, visibility 0ms linear 120ms',
        }}
      >
        <div class="min-h-0 overflow-hidden flex flex-col gap-0.5">
          <For each={visibleItems()}>
            {(item) => <div class="w-full">{item.visible()}</div>}
          </For>
          <Show when={overflowItems().length > 0}>
            <Dropdown
              placement="right-start"
              gutter={8}
              onOpenChange={props.onDropdownOpenChange}
            >
              <Dropdown.Trigger
                as={NavRow}
                class="h-8"
                fullWidth
                label={`${props.label} more`}
                tooltipPlacement="right"
                onMouseDown={(e: MouseEvent) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                }}
              >
                <DotsIcon class="size-4 shrink-0" />
                <span class="whitespace-nowrap">More</span>
              </Dropdown.Trigger>
              <Dropdown.Content class="min-w-52 shadow-menu">
                <Dropdown.Group>
                  <For each={overflowItems()}>{(item) => item.dropdown()}</For>
                  <Show when={props.dropdownFooter}>
                    {(footer) => footer()()}
                  </Show>
                </Dropdown.Group>
              </Dropdown.Content>
            </Dropdown>
          </Show>
        </div>
      </div>
    </section>
  );
}
