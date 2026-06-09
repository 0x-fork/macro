import { SidePanel } from '@app/component/side-panel';
import { useBlockId } from '@core/block';
import { usePullRequestEntityQuery } from '@queries/pull-request/pull-request';
import { createMemo, Match, Switch } from 'solid-js';
import { normalizePullRequestMetadata } from '../utils';
import { PullRequestBody } from './PullRequestBody';
import { PullRequestSplitHeaderLoading } from './PullRequestSplitHeader';
import { PullRequestSidePanelSections } from './sidepanel/PullRequestSidePanelSections';

export default function Block() {
  const id = useBlockId();
  const query = usePullRequestEntityQuery(() => id);

  const metadata = createMemo(() => {
    const data = query.data;
    if (!data) return null;
    return normalizePullRequestMetadata(data.metadata);
  });

  return (
    <div class="flex h-full flex-col @container">
      <Switch>
        <Match when={metadata()}>
          {(pr) => (
            <SidePanel.Layout>
              <PullRequestSidePanelSections metadata={pr} />
              <div class="flex size-full min-h-0 min-w-0 flex-col overflow-hidden @container">
                <PullRequestBody metadata={pr} />
              </div>
            </SidePanel.Layout>
          )}
        </Match>
        <Match when={query.isLoading}>
          <PullRequestSplitHeaderLoading />
          <div class="flex min-h-0 flex-1 items-center justify-center text-sm text-ink-faint">
            Loading pull request…
          </div>
        </Match>
        <Match when={!query.isLoading}>
          <PullRequestSplitHeaderLoading />
          <div class="flex min-h-0 flex-1 items-center justify-center text-sm text-failure">
            Failed to load pull request.
          </div>
        </Match>
      </Switch>
    </div>
  );
}
