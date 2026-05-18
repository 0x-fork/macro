import { createMemo, Show } from 'solid-js';
import { MobileFilterDrawer } from './mobile-filter-drawer';
import { SoupSearchbar } from './soup-view-search-bar';
import { MobileSoupViewTabs } from '@app/component/next-soup/soup-view/soup-view-tabs';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';

interface MobileSoupHeaderProps {
  viewName: string;
  scrollY: () => number;
  showTabs?: boolean;
}

export function MobileSoupHeader(props: MobileSoupHeaderProps) {
  const panel = useSplitPanelOrThrow();

  const isSearchView = createMemo(() => {
    const content = panel.handle.content();
    return content.type === 'component' && content.id === 'search';
  });

  return (
    <div class="shrink-0">
      <div class="flex items-center gap-3 px-4 py-3">
        <div class="flex-1 min-w-0">
          <SoupSearchbar variant="filled" placeholder="Search..." />
        </div>

        <div class="shrink-0">
          <MobileFilterDrawer />
        </div>
      </div>

      <Show when={props.showTabs !== false && !isSearchView()}>
        <div class="pr-4">
          <MobileSoupViewTabs />
        </div>
      </Show>
    </div>
  );
}

export function MobileSoupFooter() {
  return null;
}
