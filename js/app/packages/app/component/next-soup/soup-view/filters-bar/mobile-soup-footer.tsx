import { SoupSearchbar } from './soup-view-search-bar';
import { MobileFilterDrawer } from './mobile-filter-drawer';
import { MobileSoupViewTabs } from '@app/component/next-soup/soup-view/soup-view-tabs';

export const MobileSoupFooter = () => {
  return (
    <div class="shrink-0 border-t border-edge-muted bg-surface">
      <MobileSoupViewTabs />
    </div>
  );
};

export const MobileSoupHeader = () => {
  return (
    <div class="shrink-0 py-2">
      <div class="flex items-center gap-2">
        <div class="flex-1 min-w-0">
          <SoupSearchbar variant="filled" placeholder="Search..." />
        </div>
        <MobileFilterDrawer />
      </div>
    </div>
  );
};
