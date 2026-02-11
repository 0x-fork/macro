import { type Component, createSignal, For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { Popover } from '@kobalte/core/popover';
import { LabelAndHotKey, Tooltip } from '@core/component/Tooltip';
import CheckIcon from '@icon/bold/check-bold.svg';
import ChevronDownIcon from '@icon/regular/caret-down.svg';
import type { FilterID } from '@app/component/next-soup/filters/filters';

/**
 * Filter option configuration for the dropdown
 */
export interface FilterOption {
  /** Unique identifier matching FilterID */
  id: FilterID;
  /** Display label */
  label: string;
  /** Optional icon component */
  icon?: Component<{ class?: string }>;
}

export interface FilterDropdownProps {
  /** Label shown on the trigger button */
  label: string;
  /** Available filter options */
  options: FilterOption[];
  /** Currently active filter IDs */
  activeFilters: () => string[];
  /** Callback when a filter is toggled */
  onToggle: (filterId: FilterID) => void;
  /** Optional keyboard shortcut */
  shortcut?: string;
  /** Optional icon for the trigger */
  icon?: Component<{ class?: string }>;
}

/**
 * Dropdown component with checkbox options for filtering.
 * Used above the soup list for quick filter access.
 */
export const FilterDropdown: Component<FilterDropdownProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [focusedIndex, setFocusedIndex] = createSignal(0);

  const activeCount = () => {
    const active = props.activeFilters();
    return props.options.filter((opt) => active.includes(opt.id)).length;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const totalItems = props.options.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const option = props.options[focusedIndex()];
      if (option) {
        props.onToggle(option.id);
      }
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
      <Tooltip
        tooltip={
          <LabelAndHotKey label={props.label} shortcut={props.shortcut} />
        }
      >
        <Popover.Trigger
          as="button"
          type="button"
          class="flex items-center gap-1.5 h-[22px] px-2.5 shrink-0 rounded-full transition-colors"
          classList={{
            'bg-accent text-panel': activeCount() > 0 || open(),
            'text-ink-muted hover:text-accent hover:bg-accent/20':
              activeCount() === 0 && !open(),
          }}
        >
          <Show when={props.icon}>
            <Dynamic component={props.icon} class="size-3.5" />
          </Show>
          <span class="text-xs leading-none">{props.label}</span>
          <Show when={activeCount() > 0}>
            <span class="text-xs opacity-70">({activeCount()})</span>
          </Show>
          <ChevronDownIcon class="size-3 opacity-60" />
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          class="z-50 bg-panel border border-edge-muted shadow-lg"
          tabIndex={0}
          ref={(el) => setTimeout(() => el?.focus(), 0)}
          onKeyDown={handleKeyDown}
        >
          <div class="flex flex-col gap-0.5 p-1.5 min-w-[160px]">
            <For each={props.options}>
              {(option, index) => {
                const isActive = () =>
                  props.activeFilters().includes(option.id);
                return (
                  <button
                    type="button"
                    class="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-hover rounded transition-colors"
                    classList={{
                      'bg-hover': focusedIndex() === index(),
                    }}
                    onClick={() => props.onToggle(option.id)}
                    onMouseEnter={() => setFocusedIndex(index())}
                  >
                    {/* Checkbox indicator */}
                    <div
                      class="size-4 flex items-center justify-center rounded-xs border transition-colors"
                      classList={{
                        'bg-accent border-accent': isActive(),
                        'border-edge': !isActive(),
                      }}
                    >
                      <Show when={isActive()}>
                        <CheckIcon class="size-3 text-panel" />
                      </Show>
                    </div>
                    {/* Option icon if provided */}
                    <Show when={option.icon}>
                      <Dynamic
                        component={option.icon}
                        class={`size-4 ${isActive() ? 'text-accent' : 'text-ink-muted'}`}
                      />
                    </Show>
                    {/* Label */}
                    <span
                      class="flex-1 text-left"
                      classList={{
                        'text-ink': isActive(),
                        'text-ink-muted': !isActive(),
                      }}
                    >
                      {option.label}
                    </span>
                  </button>
                );
              }}
            </For>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
};

export default FilterDropdown;
