import { SidePanel } from '@app/component/side-panel';
import { SplitHeaderLeft } from '@app/component/split-layout/components/SplitHeader';
import { StaticSplitLabel } from '@app/component/split-layout/components/SplitLabel';
import { SplitToolbarLeft } from '@app/component/split-layout/components/SplitToolbar';
import GithubIcon from '@icon/mcp-github.svg';
import type { Accessor } from 'solid-js';
import type { PullRequestMetadata } from '../utils';
import { PrStatusBadge } from './PrStatusBadge';

function HeaderIcon() {
  return <GithubIcon class="size-4 shrink-0 text-ink-muted touch:size-6" />;
}

export function PullRequestSplitHeaderLoading() {
  return (
    <SplitHeaderLeft>
      <div class="my-auto flex h-full min-w-0 items-center justify-start gap-3">
        <div class="relative flex h-full min-w-0 max-w-full shrink items-center gap-2">
          <StaticSplitLabel label="Pull Request" icon={<HeaderIcon />} />
        </div>
      </div>
    </SplitHeaderLeft>
  );
}

export function PullRequestSplitHeader(props: {
  metadata: Accessor<PullRequestMetadata>;
}) {
  const label = () => props.metadata().name;

  return (
    <>
      <SplitHeaderLeft>
        <div class="my-auto flex h-full min-w-0 items-center justify-start gap-3">
          <div class="relative flex h-full min-w-0 max-w-full shrink items-center gap-2">
            <StaticSplitLabel
              label={label()}
              icon={<HeaderIcon />}
              badges={<PrStatusBadge status={props.metadata().status} />}
            />
          </div>
        </div>
      </SplitHeaderLeft>

      <SplitToolbarLeft>
        <SidePanel.NarrowTabs />
      </SplitToolbarLeft>
    </>
  );
}
