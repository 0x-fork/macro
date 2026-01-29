import IconGear from '@macro-icons/macro-gear.svg';
import XIcon from '@icon/regular/x.svg?component-solid';
import PreviewIcon from '@macro-icons/wide/preview.svg';
import NoiseIcon from '@macro-icons/wide/noise.svg';
import SignalIcon from '@macro-icons/wide/signal.svg';
import {
  type FilterID,
  getEntityTypeFilterIcon,
  getFilterWithID,
} from '@app/component/next-unified-list/filters/filters';
import {
  FilterButton,
  FilterDivider,
  ShortcutLabel,
} from '@app/component/Soup/components/FilterButton';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import { useSplitLayout } from '@app/component/split-layout/layout';
import { LabelAndHotKey, Tooltip } from '@core/component/Tooltip';
import { useSettingsState } from '@core/constant/SettingsState';
import { TOKENS } from '@core/hotkey/tokens';
import {
  For,
  createMemo,
  Show,
  onCleanup,
  createSignal,
  onMount,
  createEffect,
} from 'solid-js';
import { useSoup } from '@app/component/next-soup/soup-context';
import {
  ENTITY_TYPE_FILTERS,
  isEntityTypeFilter,
  SOUP_FILTERS,
} from '@app/component/next-soup/filters/filters';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { ValidHotkey } from '@core/hotkey/types';
import { SortDropdown } from '@app/component/Soup/components/SortDropdown';
import { createElementSize } from '@solid-primitives/resize-observer';

interface SoupToolbarProps {
  onSearchChange: (value: string) => void;
}

export const SoupToolbar = (props: SoupToolbarProps) => {
  const soup = useSoup();

  const [scrollRef, setScrollRef] = createSignal<HTMLDivElement | undefined>(
    undefined
  );

  return (
    <>
      <SplitHeaderLeft>
        <div class="relative h-full">
          <ScrollIndicators scrollRef={scrollRef()} />

          <div
            ref={setScrollRef}
            class="flex items-center h-full overflow-x-auto scrollbar-hidden overscroll-none text-xs touch:mobile-width:text-sm"
          >
            <SoupFilters />
            <input
              type="text"
              onInput={(e) => {
                props.onSearchChange(e.currentTarget.value);
              }}
            />
          </div>
        </div>
      </SplitHeaderLeft>

      <SplitHeaderRight>
        <div class="flex items-center h-full gap-0.5">
          <Tooltip
            tooltip={<LabelAndHotKey label="Clear filters" shortcut="/" />}
          >
            <button
              type="button"
              class="flex items-center gap-1.5 px-2.5 rounded-full text-ink-muted hover:text-accent hover:bg-accent/20 active:bg-accent active:text-panel"
              onClick={soup.filters.clear}
            >
              <XIcon class="size-4.5" />
              <span class="text-xs touch:mobile-width:text-sm leading-none">
                Clear
                <span class="ml-1 font-mono opacity-70">/</span>
              </span>
            </button>
          </Tooltip>
          <div class="mx-0.5 w-px h-5 bg-edge-muted/50 shrink-0" />
          <SettingsButton />
        </div>
      </SplitHeaderRight>
    </>
  );
};

const SoupFilters = () => {
  const { soup, setSearchText } = useSoupView();
  const panel = useSplitPanelOrThrow();

  const [sortDropdownOpen, setSortDropdownOpen] = createSignal(false);

  const toggleFilter = (filter: FilterID) => {
    soup.filters.toggle(filter);
  };

  const hotkeyConfigs: {
    hotkey: ValidHotkey;
    description: string;
    handler: () => void;
  }[] = [
    {
      hotkey: 'i',
      description: 'Toggle Inbox',
      handler: () => toggleFilter('signal'),
    },
    {
      hotkey: 'o',
      description: 'Toggle Other',
      handler: () => toggleFilter('noise'),
    },
    ...SOUP_FILTERS.filter((f) => isEntityTypeFilter(f.id)).map((f) => ({
      hotkey: f.shortcut as ValidHotkey,
      description: `Filter by ${f.label}`,
      handler: () => toggleFilter(f.id),
    })),
    {
      hotkey: 'u',
      description: 'Filter by Unread',
      handler: () => toggleFilter('unread'),
    },
    {
      hotkey: 's',
      description: 'Open sort menu',
      handler: () => setSortDropdownOpen((prev) => !prev),
    },
    {
      hotkey: '/',
      description: 'Clear filters',
      handler: () => {
        soup.filters.clear();
        setSearchText('');
      },
    },
  ];

  const hotkeyDisposers = hotkeyConfigs.map((config) =>
    registerHotkey({
      hotkey: [config.hotkey],
      scopeId: panel.splitHotkeyScope,
      description: config.description,
      keyDownHandler: () => {
        config.handler();
        return true;
      },
      registrationType: 'add',
    })
  );

  onCleanup(() => {
    hotkeyDisposers.forEach((d) => d.dispose());
  });

  return (
    <>
      {/* Inbox toggle */}
      <FilterButton
        icon={SignalIcon}
        label="Inbox"
        shortcut="i"
        isActive={soup.filters.isActive('signal')}
        onClick={() => toggleFilter('signal')}
      />
      {/* Other toggle */}
      <FilterButton
        icon={NoiseIcon}
        label="Other"
        shortcut="o"
        isActive={soup.filters.isActive('noise')}
        onClick={() => toggleFilter('noise')}
      />
      <FilterDivider />
      {/* Unread filter */}
      <div class="flex items-center mr-0.5 shrink-0">
        <Tooltip tooltip={<LabelAndHotKey label="Unread Only" shortcut="u" />}>
          <button
            type="button"
            class="flex items-center gap-1 h-[22px] touch:mobile-width:h-9 pr-2.5 pl-1 active:bg-accent active:text-panel rounded-full"
            classList={{
              'bg-accent text-panel': soup.filters.isActive('unread'),
              'text-ink-muted hover:text-accent hover:bg-accent/20':
                !soup.filters.isActive('unread'),
            }}
            onClick={() => soup.filters.toggle('unread')}
          >
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="12" r="4" />
            </svg>
            <span class="leading-none">
              <ShortcutLabel label="Unread" shortcut="u" />
            </span>
          </button>
        </Tooltip>
      </div>
      <div class="mx-0.5 w-px h-5 bg-edge-muted/50 shrink-0" />
      {/* Entity type icons */}
      <div class="flex items-center shrink-0">
        <For each={ENTITY_TYPE_FILTERS}>
          {(filter) => {
            const iconConfig = () => getEntityTypeFilterIcon(filter);
            const details = createMemo(() => getFilterWithID(filter));

            return (
              <FilterButton
                icon={iconConfig().icon}
                label={details()?.label ?? ''}
                shortcut={''}
                isActive={() => soup.filters.isActive(filter)}
                onClick={() => toggleFilter(filter)}
                paddingClass="px-2.5"
              />
            );
          }}
        </For>
      </div>
      <div class="mx-0.5 w-px h-5 bg-edge-muted/50 shrink-0" />
      {/* Preview toggle */}
      <Tooltip
        tooltip={<LabelAndHotKey label="Toggle Preview" shortcut="space" />}
      >
        <button
          type="button"
          class="flex items-center gap-1.5 h-[22px] touch:mobile-width:h-9 px-2.5 active:bg-accent active:text-panel rounded-full"
          classList={{
            'bg-accent text-panel': !!soup.previewEntity(),
            'text-ink-muted hover:text-accent hover:bg-accent/20':
              !soup.previewEntity(),
          }}
          disabled={!soup.focus.id()}
          onClick={() => {
            const currentPreview = soup.previewEntity();
            if (currentPreview) {
              soup.setPreviewEntity(undefined);
              return;
            }

            const focused = soup.focus.id();

            if (!focused) return;

            soup.setPreviewEntity(focused);
          }}
        >
          <PreviewIcon class="size-4.5" />
          <span class="leading-none">
            <ShortcutLabel label="Preview" shortcut="space" />
          </span>
        </button>
      </Tooltip>
      <FilterDivider />
      {/* Sort dropdown */}
      {/* <SortDropdown */}
      {/*   open={sortDropdownOpen} */}
      {/*   onOpenChange={setSortDropdownOpen} */}
      {/*   value={soup.sort()[0]?.id} */}
      {/*   onChange={onSortChange} */}
      {/* /> */}
      <div class="touch:mobile-width:-order-1">
        <FilterDivider />
      </div>
      {/* Filter search bar */}
    </>
  );
};

function SettingsButton() {
  const { settingsOpen, toggleSettings } = useSettingsState();
  const { getSplitCount } = useSplitLayout();

  // Hide settings button when there are multiple splits
  const isSingleSplit = () => getSplitCount() <= 1;

  return (
    <Show when={isSingleSplit()}>
      <Tooltip
        tooltip={
          <LabelAndHotKey
            label={settingsOpen() ? 'Close Settings' : 'Open Settings'}
            hotkeyToken={TOKENS.global.toggleSettings}
          />
        }
      >
        <button
          type="button"
          class="relative flex items-center justify-center size-[22px] rounded-full active:bg-accent active:text-panel"
          classList={{
            'bg-hover text-ink': settingsOpen(),
            'text-ink-muted hover:text-accent hover:bg-accent/20':
              !settingsOpen(),
          }}
          onClick={() => toggleSettings()}
        >
          <IconGear class="size-4.5" />
        </button>
      </Tooltip>
    </Show>
  );
}

const ScrollIndicators = (props: { scrollRef: HTMLElement | undefined }) => {
  const [leftOpacity, setLeftOpacity] = createSignal(0);
  const [rightOpacity, setRightOpacity] = createSignal(0);
  const SCROLL_THRESHOLD = 10;

  // Track size changes to update indicators
  const size = createElementSize(() => props.scrollRef);
  const containerWidth = () => size.width ?? 0;

  const updateClipIndicators = () => {
    const ref = props.scrollRef;
    if (!ref) return;
    const { scrollLeft, scrollWidth, clientWidth } = ref;

    const leftAmount = Math.min(scrollLeft, SCROLL_THRESHOLD);
    setLeftOpacity(leftAmount / SCROLL_THRESHOLD);

    const maxScroll = scrollWidth - clientWidth;
    const remainingScroll = maxScroll - scrollLeft;
    const rightAmount = Math.min(remainingScroll, SCROLL_THRESHOLD);
    setRightOpacity(rightAmount / SCROLL_THRESHOLD);
  };

  // Update indicators when size changes
  createEffect(() => {
    containerWidth(); // Track size changes
    updateClipIndicators();
  });

  onMount(() => {
    const ref = props.scrollRef;
    if (!ref) return;
    ref.addEventListener('scroll', updateClipIndicators);
    onCleanup(() => ref?.removeEventListener('scroll', updateClipIndicators));
  });
  return (
    <>
      {/* Left clip boundary indicator */}
      <div
        class="absolute pointer-events-none left-0 top-px bottom-px w-3 z-2 pattern-diagonal-4 pattern-edge mask-r-from-0% border-l border-edge-muted"
        style={{ opacity: leftOpacity() }}
      />
      {/* Right clip boundary indicator */}
      <div
        class="absolute pointer-events-none right-0 top-px bottom-px w-3 z-2 pattern-diagonal-4 pattern-edge mask-l-from-0% border-r border-edge-muted"
        style={{ opacity: rightOpacity() }}
      />
    </>
  );
};
