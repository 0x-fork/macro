import { cn } from '../utils/classname';
import {  createSignal, For, type JSX, Show } from 'solid-js';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import DotsThreeIcon from '@phosphor/dots-three.svg';
import { Layer } from './Layer';

export type TabSize = 'sm' | 'md' | 'lg';

export interface TabItem {
  value: string;
  label: string;
  icon?: () => JSX.Element;
}

export interface TabGroupProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  size?: TabSize;
  class?: string;
}

const sizeStyles: Record<TabSize, { tab: string; text: string }> = {
  sm: {
    tab: 'px-1.5 py-0.5 gap-1',
    text: 'text-xs',
  },
  md: {
    tab: 'px-2 py-0.5 gap-1.5',
    text: 'text-xs',
  },
  lg: {
    tab: 'px-2.5 py-1 gap-2',
    text: 'text-sm',
  },
};

export const TabGroup = (props: TabGroupProps) => {
  const size = () => props.size ?? 'md';
  const styles = () => sizeStyles[size()];

  return (
    <div class={cn('flex items-center gap-1', props.class)}>
      <For each={props.items}>
        {(item) => (
          <button
            type="button"
            class={cn(
              'rounded-sm transition-colors inline-flex items-center',
              styles().tab,
              styles().text,
              props.value === item.value
                ? 'bg-ink/10 text-ink'
                : 'text-ink-extra-muted hover:text-ink hover:bg-ink/5'
            )}
            onClick={() => props.onChange(item.value)}
          >
            <Show when={item.icon}>
              {(icon) => (
                <span class="shrink-0 [&_svg]:size-3">{icon()()}</span>
              )}
            </Show>
            {item.label}
          </button>
        )}
      </For>
    </div>
  );
};

export interface OverflowTabGroupProps extends TabGroupProps {
  overflowButtonWidth?: number;
}

export const OverflowTabGroup = (props: OverflowTabGroupProps) => {
  const size = () => props.size ?? 'md';
  const styles = () => sizeStyles[size()];

  let measureRef: HTMLDivElement | undefined;
  let tabWidths: number[] = [];

  const [visibleCount, setVisibleCount] = createSignal(props.items.length);
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | null>(null);

  const measureTabWidths = () => {
    if (!measureRef) return;
    const buttons = measureRef.querySelectorAll('button');
    tabWidths = Array.from(buttons).map((btn) => btn.offsetWidth);
  };

  const calculateVisibleTabs = () => {
    const container = containerRef();
    if (!container || tabWidths.length === 0) return;

    const containerWidth = container.offsetWidth;
    const overflowButtonWidth = props.overflowButtonWidth ?? 28;
    const gap = 4;

    const totalAllTabs = tabWidths.reduce((sum, w, i) => sum + w + (i > 0 ? gap : 0), 0);
    if (totalAllTabs <= containerWidth) {
      setVisibleCount(props.items.length);
      return;
    }

    let totalWidth = 0;
    let count = 0;
    const availableWidth = containerWidth - overflowButtonWidth - gap;

    for (let i = 0; i < props.items.length; i++) {
      const btnWidth = tabWidths[i] || 50;
      const widthWithGap = totalWidth + btnWidth + (count > 0 ? gap : 0);

      if (widthWithGap <= availableWidth) {
        totalWidth = widthWithGap;
        count++;
      } else {
        break;
      }
    }

    setVisibleCount(Math.max(1, count));
  };

  const setupResizeObserver = (container: HTMLDivElement) => {
    setContainerRef(container);
    measureTabWidths();

    const observer = new ResizeObserver(calculateVisibleTabs);
    observer.observe(container);
    calculateVisibleTabs();

    return () => observer.disconnect();
  };

  const visibleTabs = () => props.items.slice(0, visibleCount());
  const overflowTabs = () => props.items.slice(visibleCount());
  const hasOverflow = () => overflowTabs().length > 0;

  return (
    <div ref={setupResizeObserver} class={cn('relative flex-1 min-w-0', props.class)}>
      <div
        ref={measureRef}
        class="fixed invisible pointer-events-none flex items-center gap-1"
        aria-hidden="true"
      >
        <For each={props.items}>
          {(item) => (
            <button
              type="button"
              class={cn(
                'rounded-sm transition-colors whitespace-nowrap inline-flex items-center',
                styles().tab,
                styles().text
              )}
            >
              {item.label}
            </button>
          )}
        </For>
      </div>

      <div class="flex items-center gap-1">
        <For each={visibleTabs()}>
          {(item) => (
            <button
              type="button"
              class={cn(
                'rounded-sm transition-colors whitespace-nowrap inline-flex items-center',
                styles().tab,
                styles().text,
                props.value === item.value
                  ? 'bg-ink/10 text-ink'
                  : 'text-ink-extra-muted hover:text-ink hover:bg-ink/5'
              )}
              onClick={() => props.onChange(item.value)}
            >
              <Show when={item.icon}>
                {(icon) => (
                  <span class="shrink-0 [&_svg]:size-3">{icon()()}</span>
                )}
              </Show>
              {item.label}
            </button>
          )}
        </For>

        <Show when={hasOverflow()}>
          <DropdownMenu placement="bottom-start" gutter={4}>
            <DropdownMenu.Trigger
              class={cn(
                'rounded-sm transition-colors whitespace-nowrap',
                styles().tab,
                styles().text,
                overflowTabs().some((t) => t.value === props.value)
                  ? 'bg-ink/10 text-ink'
                  : 'text-ink-extra-muted hover:text-ink hover:bg-ink/5'
              )}
            >
              <DotsThreeIcon class="size-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <Layer depth={2}>
                <DropdownMenu.Content class="z-action-menu bg-surface border border-edge-muted rounded-sm shadow-sm p-1 min-w-[100px]">
                  <For each={overflowTabs()}>
                    {(item) => (
                      <DropdownMenu.Item
                        class="w-full px-2 py-1.5 text-left text-xs transition-colors hover:bg-ink/5 focus:bg-ink/5 outline-none cursor-default rounded-sm"
                        classList={{
                          'font-medium text-ink': props.value === item.value,
                          'text-ink-muted': props.value !== item.value,
                        }}
                        onSelect={() => props.onChange(item.value)}
                      >
                        {item.label}
                      </DropdownMenu.Item>
                    )}
                  </For>
                </DropdownMenu.Content>
              </Layer>
            </DropdownMenu.Portal>
          </DropdownMenu>
        </Show>
      </div>
    </div>
  );
};
