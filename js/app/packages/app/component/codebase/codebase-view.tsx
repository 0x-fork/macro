import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { createEffect } from 'solid-js';
import { OverviewSection } from './overview-section';

/**
 * The codebase view: a single dashboard of the team's pull requests — what
 * requires my attention, everyone's work as a filterable unified list, and
 * key insights in the right side panel. The filter toolbar lives in the
 * split header (rendered by the overview via a portal). Not a soup
 * `ListView` — it owns its queries and grouping (see `data.ts`).
 */
export function CodebaseView() {
  const panel = useSplitPanelOrThrow();

  createEffect(() => {
    panel.handle.setDisplayName('Codebase');
  });

  return (
    <div class="size-full flex flex-col">
      <OverviewSection />
    </div>
  );
}
