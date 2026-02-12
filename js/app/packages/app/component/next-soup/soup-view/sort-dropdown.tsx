import { type Component, createSignal, For, Show } from 'solid-js';
import { Popover } from '@kobalte/core/popover';
import SortIcon from '@macro-icons/wide/sort.svg';
import type { SystemSortOption } from '@app/component/next-soup/soup-view/sort-options';
import { ShortcutLabel } from '@app/component/next-soup/soup-view/soup-toolbar';

export interface SortOption {
  value: SystemSortOption;
  label: string;
}

export const SORT_OPTIONS: SortOption[] = [
  { value: 'viewed_at', label: 'Viewed' },
  { value: 'updated_at', label: 'Updated' },
  { value: 'created_at', label: 'Created' },
];

export interface SortDropdownProps {
  /** Current sort value */
  value: () => SystemSortOption;
  /** Handler for sort change */
  onChange: (value: SystemSortOption) => void;
  /** Available sort options (defaults to SORT_OPTIONS) */
  options?: SortOption[];
  /** Controlled open state (optional - uses internal state if not provided) */
  open?: () => boolean;
  /** Controlled open state setter (optional - uses internal state if not provided) */
  onOpenChange?: (open: boolean) => void;
  /** Layout mode for trigger button */
  layout?: 'horizontal' | 'vertical';
}

export const SortDropdown: Component<SortDropdownProps> = (props) => {
  // Internal state for uncontrolled mode
  const [internalOpen, setInternalOpen] = createSignal(false);
  const [focusedIndex, setFocusedIndex] = createSignal(0);

  // Use controlled or uncontrolled state
  const open = () => props.open?.() ?? internalOpen();
  const setOpen = (isOpen: boolean) => {
    if (props.onOpenChange) {
      props.onOpenChange(isOpen);
    } else {
      setInternalOpen(isOpen);
    }
  };

  const options = () => props.options ?? SORT_OPTIONS;
  const isVertical = () => props.layout === 'vertical';

  const handleKeyDown = (e: KeyboardEvent) => {
    const totalItems = options().length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      props.onChange(options()[focusedIndex()].value);
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <Popover
      open={open()}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (isOpen) setFocusedIndex(0);
      }}
      placement="bottom-start"
      gutter={4}
    >
      <Popover.Trigger
        as="button"
        type="button"
        class="shrink-0 active:bg-hover active:text-ink"
        classList={{
          'flex items-center gap-1.5 h-full px-2.5 rounded-none': !isVertical(),
          'w-full flex flex-col items-center justify-center gap-2 px-2 py-2 rounded-none':
            isVertical(),
          'bg-edge-muted/70 text-ink font-medium': open(),
          'text-ink-muted hover:text-ink hover:bg-hover/70': !open(),
        }}
      >
        <SortIcon class="size-4" />
        <span
          classList={{
            'leading-none text-[11px]': !isVertical(),
            'leading-none text-[6pt] text-center': isVertical(),
            'text-ink': isVertical() && open(),
            'text-ink': isVertical() && !open(),
          }}
        >
          <ShortcutLabel label="Sort" shortcut="s" />
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          class="z-50 bg-panel border border-edge-muted shadow-lg"
          tabIndex={0}
          ref={(el) => setTimeout(() => el?.focus(), 0)}
          onKeyDown={handleKeyDown}
        >
          <div class="flex flex-col gap-1 p-2 min-w-[140px]">
            <For each={options()}>
              {(option, index) => (
                <button
                  type="button"
                  class="flex items-center justify-between px-2 py-1.5 text-sm hover:bg-hover"
                  classList={{
                    'bg-edge-muted/70 text-ink': props.value() === option.value,
                    'text-ink': props.value() !== option.value,
                    'bg-hover': focusedIndex() === index(),
                  }}
                  onClick={() => {
                    props.onChange(option.value);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setFocusedIndex(index())}
                >
                  <span>{option.label}</span>
                  <Show when={props.value() === option.value}>
                    <span class="text-ink">✓</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
};
