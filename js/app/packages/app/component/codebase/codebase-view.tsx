import { SplitHeaderLeft } from '@app/component/split-layout/components/SplitHeader';
import { useEntryState } from '@app/component/split-layout/entry-state';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { TabsInset } from '@core/component/TabsInset';
import { createEffect, Match, Switch } from 'solid-js';
import { InsightsSection } from './insights-section';
import { OverviewSection } from './overview-section';
import { TasksSection } from './tasks-section';

const CODEBASE_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'insights', label: 'Insights' },
] as const;

type CodebaseTab = (typeof CODEBASE_TABS)[number]['value'];

/**
 * The codebase view: the Overview dashboard (my PRs, what requires my
 * attention, and everyone's pull requests), tasks grouped by project, and
 * delivery insights. Not a soup `ListView` — it owns its queries and grouping
 * (see `data.ts`). The Overview tab renders its own connect-GitHub state.
 */
export function CodebaseView() {
  const panel = useSplitPanelOrThrow();

  createEffect(() => {
    panel.handle.setDisplayName('Codebase');
  });

  const [activeTab, setActiveTab] = useEntryState<CodebaseTab>('codebase.tab', {
    default: 'overview',
  });

  return (
    <div class="size-full flex flex-col">
      <SplitHeaderLeft>
        <div class="h-full flex items-center gap-3">
          <span class="text-sm font-semibold">Codebase</span>
          <TabsInset
            list={[...CODEBASE_TABS]}
            value={activeTab()}
            onChange={(value) => setActiveTab(value as CodebaseTab)}
          />
        </div>
      </SplitHeaderLeft>

      <Switch>
        <Match when={activeTab() === 'tasks'}>
          <TasksSection />
        </Match>
        <Match when={activeTab() === 'insights'}>
          <InsightsSection />
        </Match>
        {/* Overview is also the fallback for stale persisted tab values
            (e.g. the removed "pull-requests" tab). */}
        <Match when={true}>
          <OverviewSection />
        </Match>
      </Switch>
    </div>
  );
}
