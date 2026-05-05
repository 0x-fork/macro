import { SoupViewContextSort } from '@app/component/next-soup/soup-view/filters-bar/soup-view-context-sort';
import { useFilterRefinements } from '@app/component/next-soup/soup-view/filters-bar/use-filter-refinements';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { createMemo, createSignal, Show } from 'solid-js';
import { UnifiedFilterDropdown } from '@app/component/next-soup/soup-view/filters-bar/unified-filter-dropdown';
import { ActiveFilterChips } from '@app/component/next-soup/soup-view/filters-bar/active-filter-chips';
import { isMobile } from '@core/mobile/isMobile';
import { LabelAndHotKey, Tooltip } from '@core/component/Tooltip';
import { Button } from './button';
import { SoupSearchbar } from './soup-view-search-bar';
import { AnimatedPreviewIcon } from '@macro-icons/wide/animating/preview';
import { useSoup } from '../../soup-context';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { useAnalytics } from '@app/component/analytics-context';

export const SoupPreviewButton = () => {
  const [previewBtnHovering, setPreviewBtnHovering] = createSignal(false);
  const soup = useSoup();
  const panel = useSplitPanelOrThrow();
  const analytics = useAnalytics();

  const togglePreview = () => {
    const currentPreview = soup.previewEntity();
    if (currentPreview) {
      soup.setPreviewEntity(undefined);
      return;
    }

    const focused = soup.focus.id();
    if (!focused) return;

    analytics.track('preview_panel_use');
    soup.setPreviewEntity(focused);
  };

  registerHotkey({
    hotkey: 'space',
    scopeId: panel.splitHotkeyScope,
    description: 'Toggle preview',
    keyDownHandler: () => {
      togglePreview();
      return true;
    },
  });

  return (
    <Tooltip tooltip={<LabelAndHotKey label="Preview" shortcut="space" />}>
      <Button
        variant={soup.previewEntity() ? 'primary' : 'secondary'}
        size="sm"
        class="rounded-xs [&_svg]:size-4 p-1.5 aspect-square"
        onClick={togglePreview}
        onMouseEnter={() => setPreviewBtnHovering(true)}
        onMouseLeave={() => setPreviewBtnHovering(false)}
      >
        <AnimatedPreviewIcon triggerAnimation={previewBtnHovering()} />
      </Button>
    </Tooltip>
  );
};

export const SoupFiltersBar = () => {
  const {
    resetToTabDefaults,
    activeFiltersList,
    removeFilter,
    replaceFilter,
    isOptionActive,
  } = useFilterRefinements();

  const panel = useSplitPanelOrThrow();

  const isSearchView = createMemo(() => {
    const content = panel.handle.content();
    return content.type === 'component' && content.id === 'search';
  });

  return (
    <Show when={!isMobile()}>
      <div class="flex flex-col w-full">
        <div
          class="flex items-center gap-2 w-full"
          classList={{
            'px-4 py-2': isSearchView(),
            'px-4 py-1.5': !isSearchView(),
          }}
        >
          <div class="w-56 shrink-0">
            <SoupSearchbar variant="secondary" />
          </div>
          <div class="flex-1" />
          <UnifiedFilterDropdown />
          <Show when={!isSearchView()}>
            <SoupViewContextSort />
          </Show>
        </div>
        <Show when={activeFiltersList().length > 0}>
          <div class="px-4 pb-1.5">
            <ActiveFilterChips
              filters={activeFiltersList()}
              onRemove={removeFilter}
              onReplace={replaceFilter}
              onClearAll={resetToTabDefaults}
              isOptionActive={isOptionActive}
            />
          </div>
        </Show>
      </div>
    </Show>
  );
};
