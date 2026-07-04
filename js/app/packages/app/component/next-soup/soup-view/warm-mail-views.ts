import {
  getViewPreset,
  type PresetContext,
} from '@app/component/app-sidebar/soup-filter-presets';
import type { SoupAstBody } from '@queries/soup/items';
import { prefetchSoupAstItemsFirstPage } from '@queries/soup/items';
import { compileToAst, queryStateFrom } from '../filters/filter-store/compile';

/**
 * Mail tabs whose list queries are slow enough server-side (e.g. Sent's
 * partial-sender scan) that a cold first click stalls for seconds. Warmed
 * at idle so the first visit serves from cache; results persist via the
 * soup-list-queries scope, covering cold starts too.
 */
const MAIL_TABS_TO_WARM = ['sent', 'drafts', 'noise', 'all'] as const;

const WARM_DELAY_MS = 15_000;

let scheduled = false;

/**
 * Warms the first page of each mail tab view (Sent, Drafts, …) shortly
 * after an authenticated start. Mirrors the view's own query construction:
 * preset filters compiled to the soup AST with the standard list params.
 * Call once auth is confirmed.
 */
export function scheduleMailViewWarming(ctx: PresetContext): void {
  if (scheduled) return;
  scheduled = true;

  setTimeout(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    for (const tab of MAIL_TABS_TO_WARM) {
      const preset = getViewPreset('mail', tab, ctx);
      if (!preset) continue;
      const body = compileToAst(queryStateFrom(preset.filters)) as SoupAstBody;
      void prefetchSoupAstItemsFirstPage({
        params: { limit: 100, sort_method: 'updated_at' },
        body,
      }).catch(() => {});
    }
  }, WARM_DELAY_MS);
}
