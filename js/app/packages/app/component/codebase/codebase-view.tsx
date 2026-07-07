import { SplitHeaderLeft } from '@app/component/split-layout/components/SplitHeader';
import { useEntryState } from '@app/component/split-layout/entry-state';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { TabsInset } from '@core/component/TabsInset';
import { useSettingsState } from '@core/constant/SettingsState';
import GitPullRequestIcon from '@phosphor/git-pull-request.svg';
import { useGithubLinkStatusQuery } from '@queries/auth/github-link';
import { EmptyStatePanel } from '@ui';
import { createEffect, Match, Show, Switch } from 'solid-js';
import { InsightsSection } from './insights-section';
import { OverviewSection } from './overview-section';
import { PullRequestsSection } from './pull-requests-section';
import { TasksSection } from './tasks-section';

const CODEBASE_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'pull-requests', label: 'Pull requests' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'insights', label: 'Insights' },
] as const;

type CodebaseTab = (typeof CODEBASE_TABS)[number]['value'];

/**
 * The codebase view: GitHub pull requests grouped by author, tasks grouped by
 * project, and delivery insights, in one place. Not a soup `ListView` — it
 * owns its queries and grouping (see `data.ts`).
 */
export function CodebaseView() {
  const panel = useSplitPanelOrThrow();
  const { openSettings } = useSettingsState();
  const githubLink = useGithubLinkStatusQuery();

  createEffect(() => {
    panel.handle.setDisplayName('Codebase');
  });

  const [activeTab, setActiveTab] = useEntryState<CodebaseTab>('codebase.tab', {
    default: 'overview',
  });

  const githubLinked = () => githubLink.data?.status === 'linked';
  // Only hard-gate on GitHub before any link data arrives; tasks and insights
  // remain useful without a linked account.
  const showConnectPrompt = () =>
    githubLink.isSuccess && !githubLinked() && activeTab() === 'pull-requests';

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

      <Show
        when={!showConnectPrompt()}
        fallback={
          <EmptyStatePanel
            centered
            graphic={GitPullRequestIcon}
            graphicClass="h-24 w-24 text-ink-extra-muted"
            title="Connect GitHub"
            description="Link your GitHub account to see pull requests across your team, grouped by person."
            primaryAction={{
              label: 'Open GitHub settings',
              onClick: () => openSettings('GitHub'),
            }}
          />
        }
      >
        <Switch>
          <Match when={activeTab() === 'overview'}>
            <OverviewSection
              onShowPullRequests={() => setActiveTab('pull-requests')}
              onShowTasks={() => setActiveTab('tasks')}
            />
          </Match>
          <Match when={activeTab() === 'pull-requests'}>
            <PullRequestsSection />
          </Match>
          <Match when={activeTab() === 'tasks'}>
            <TasksSection />
          </Match>
          <Match when={activeTab() === 'insights'}>
            <InsightsSection />
          </Match>
        </Switch>
      </Show>
    </div>
  );
}
