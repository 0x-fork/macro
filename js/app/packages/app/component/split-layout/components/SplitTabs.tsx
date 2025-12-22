import { playSound } from '@app/util/sound';
import { ToggleButton } from '@core/component/FormControls/ToggleButton';
import { TOKENS } from '@core/hotkey/tokens';
import type { ViewId } from '@core/types/view';
import { Tabs } from '@kobalte/core';
import { createElementSize } from '@solid-primitives/resize-observer';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSXElement,
  onMount,
  type Setter,
  Show,
} from 'solid-js';
import { useSplitPanelOrThrow } from '../layoutUtils';

// NOTE: unused since everything should already be correctly cased
const _titleCase = (str: string) => {
  return str
    .split('')
    .map((c, i) => (i === 0 ? c.toUpperCase() : c.toLowerCase()))
    .join('');
};

const SCROLL_THRESHOLD = 10;

export function SplitTabs(props: {
  // values: readonly View[];
  list: { value: ViewId; label: string; index: number }[];
  active: Accessor<ViewId>;
  setButtonsRef?: Setter<HTMLDivElement | null>;
  newButton?: JSXElement;
  contextMenu?: (props: { value: ViewId; label: string }) => JSXElement;
  tabAddon?: (props: {
    value: ViewId;
    label: string;
    index: number;
    active: boolean;
    triggerEl?: HTMLElement;
  }) => JSXElement;
}) {
  let scrollRef!: HTMLDivElement;
  const panel = useSplitPanelOrThrow();
  const size = createElementSize(panel.panelRef ?? null);
  const panelWidth = () => size.width ?? 0;

  const [leftOpacity, setLeftOpacity] = createSignal(0);
  const [rightOpacity, setRightOpacity] = createSignal(0);

  const updateClipIndicators = () => {
    if (!scrollRef) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef;

    const leftAmount = Math.min(scrollLeft, SCROLL_THRESHOLD);
    setLeftOpacity(leftAmount / SCROLL_THRESHOLD);

    const maxScroll = scrollWidth - clientWidth;
    const remainingScroll = maxScroll - scrollLeft;
    const rightAmount = Math.min(remainingScroll, SCROLL_THRESHOLD);
    setRightOpacity(rightAmount / SCROLL_THRESHOLD);
  };

  onMount(() => {
    const listener = (e: WheelEvent) => {
      e.preventDefault();
      const { deltaX, deltaY } = e;
      const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
      scrollRef.scrollLeft += delta;
      updateClipIndicators();
    };
    const scrollListener = () => {
      updateClipIndicators();
    };
    scrollRef.addEventListener('wheel', listener);
    scrollRef.addEventListener('scroll', scrollListener);
    updateClipIndicators();
    return () => {
      scrollRef.removeEventListener('wheel', listener);
      scrollRef.removeEventListener('scroll', scrollListener);
    };
  });

  createEffect(() => {
    panelWidth();
    updateClipIndicators();
  });

  // Play sound when tab changes
  let previousActive: ViewId | undefined;
  createEffect(() => {
    const currentActive = props.active();
    if (previousActive !== undefined && previousActive !== currentActive) {
      playSound('open');
    }
    previousActive = currentActive;
  });

  return (
    <div class="relative isolate h-full shrink-0 max-w-[65cqw] @container-normal">
      {/* Left clip boundary indicator */}
      <div
        class="absolute pointer-events-none left-0 top-px bottom-px w-1 z-2 border-l border-edge-muted transition-opacity duration-150"
        style={{ opacity: leftOpacity() }}
      />
      {/* Right clip boundary indicator */}
      <div
        class="absolute pointer-events-none right-0 top-px bottom-px w-1 z-2 border-r border-edge-muted transition-opacity duration-150"
        style={{ opacity: rightOpacity() }}
      />

      <Tabs.List
        class="flex flex-row items-center suppress-css-brackets h-full bg-panel overflow-x-scroll overscroll-none scrollbar-hidden scroll-shadows-x relative px-2 gap-0"
        as="div"
        ref={(r) => {
          scrollRef = r;
          props.setButtonsRef?.(r);
        }}
      >
        <For each={props.list}>
          {({ value, label, index }, i) => {
            const isActive = createMemo(() => value === props.active());

            const renderMnemonicLabel = () => {
              const mnemonicMap: Partial<Record<ViewId, string>> = {
                files: 'd',
                people: 'm',
                email: 'e',
                tasks: 't',
                agents: 'a',
                folders: 'f',
                all: '/',
              };
              const key = mnemonicMap[value];
              if (!key) return <span class="truncate">{label}</span>;

              const strong = (ch: string) => (
                <span class="font-semibold underline underline-offset-2">
                  {ch}
                </span>
              );

              // If the mnemonic exists inside the label, underline that letter.
              const idx = label.toLowerCase().indexOf(key.toLowerCase());
              if (idx >= 0) {
                return (
                  <span class="truncate">
                    {label.slice(0, idx)}
                    {strong(label[idx]!)}
                    {label.slice(idx + 1)}
                  </span>
                );
              }

              // Otherwise, prefix the mnemonic (e.g. "C Msg", "/ All").
              return (
                <span class="truncate">
                  {strong(key)}
                  <span class="opacity-70"> </span>
                  {label}
                </span>
              );
            };

            const isAfterAll = () =>
              i() > 0 && props.list[i() - 1]?.value === 'all';

            let ref: HTMLDivElement | undefined;
            createEffect(() => {
              panelWidth(); // react on width to not clip active tab.
              if (isActive() && ref) {
                ref.scrollIntoView({
                  inline: 'end',
                });
                setTimeout(updateClipIndicators, 0);
              }
            });

            createEffect(() => {
              if (isActive()) {
                panel.handle.setDisplayName(label);
              }
            });

            return (
              <Show
                when={value !== 'all'}
                fallback={
                  <Tabs.Trigger value={value} class="hidden" tabIndex={-1} />
                }
              >
                <Tabs.Trigger
                  value={value}
                  ref={ref}
                  tabIndex={-1}
                  class="shrink-0 max-w-[40cqw] text-sm relative h-full flex items-center focus-bracket-within [&:focus-within]:[--focus-border-inset:-3px]"
                  onPointerDown={(e) => {
                    // Kobalte updates the active tab on pointerdown.
                    // We only want "click active tab toggles back to `all`" when it was
                    // already active *before* the interaction began.
                    //
                    // Stash it on the element to share with onClick without extra signals.
                    (
                      e.currentTarget as HTMLElement
                    ).dataset.wasActiveOnPointerDown = String(isActive());
                  }}
                  onClick={(e) => {
                    // Make type tabs toggleable: clicking the active tab clears selection to internal `all`.
                    // This should match the hotkey toggle behavior (e.g. pressing `e` twice).
                    const wasActiveOnPointerDown =
                      (e.currentTarget as HTMLElement).dataset
                        .wasActiveOnPointerDown === 'true';
                    if (!wasActiveOnPointerDown) return;
                    if (
                      'button' in e &&
                      typeof e.button === 'number' &&
                      e.button !== 0
                    )
                      return;
                    e.preventDefault();
                    e.stopPropagation();
                    panel.unifiedListContext.setSelectedView('all');
                  }}
                  classList={{
                    // visually group Signal/Noise/All together, then all others as a second group
                    'mr-1': value === 'all',
                    'ml-1': isAfterAll(),
                    'ml-[-1px]': i() > 0 && !isAfterAll(),
                  }}
                  data-hotkey-token={
                    TOKENS.soup.tabs[
                      index.toString() as keyof typeof TOKENS.soup.tabs
                    ]
                  }
                >
                  <ToggleButton
                    as="div"
                    size="SM"
                    pressed={isActive()}
                    tabIndex={-1}
                    class="pointer-events-none"
                    classList={{
                      'max-w-[40cqw]': true,
                    }}
                  >
                    <span class="flex items-baseline gap-1 max-w-full">
                      {renderMnemonicLabel()}
                    </span>
                  </ToggleButton>
                  {props.tabAddon?.({
                    value,
                    label,
                    index,
                    active: isActive(),
                    triggerEl: ref,
                  })}
                  {/* <Show when={isActive()}>
                  <BrightJoins dots={[true, true, true, true]} />
                </Show> */}
                  {props.contextMenu?.({ label, value })}
                </Tabs.Trigger>
              </Show>
            );
          }}
        </For>
        {props.newButton}
      </Tabs.List>
    </div>
  );
}
