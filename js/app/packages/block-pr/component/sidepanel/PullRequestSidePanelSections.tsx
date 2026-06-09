import { SidePanel } from '@app/component/side-panel';
import { openExternalUrl } from '@core/util/url';
import GithubIcon from '@icon/mcp-github.svg';
import ArrowSquareOut from '@phosphor/arrow-square-out.svg';
import { cn } from '@ui';
import { type Accessor, For, Show } from 'solid-js';
import { hasLineChanges, type PullRequestMetadata } from '../../utils';
import { PrCheckRow } from '../PrChecks';
import { PrStatusBadge } from '../PrStatusBadge';

export function PullRequestSidePanelSections(props: {
  metadata: Accessor<PullRequestMetadata>;
}) {
  const metadata = props.metadata;
  const checks = () => metadata().checks;

  return (
    <>
      <SidePanel.Section id="details" title="Details" defaultOpen order={10}>
        <div class="flex flex-col gap-3">
          <SidePanel.Grid>
            <SidePanel.Row label="Status">
              <PrStatusBadge status={metadata().status} />
            </SidePanel.Row>
            <SidePanel.Row label="Repository">
              <SidePanel.Pill>
                <span class="truncate font-mono">
                  {metadata().owner}/{metadata().repo}
                </span>
              </SidePanel.Pill>
            </SidePanel.Row>
            <SidePanel.Row label="Number">
              <SidePanel.Pill>
                <span class="truncate">#{metadata().number}</span>
              </SidePanel.Pill>
            </SidePanel.Row>
            <Show when={hasLineChanges(metadata())}>
              <SidePanel.Row label="Changes">
                <SidePanel.Pill>
                  <span class="font-mono tabular-nums">
                    <span class="text-success">+{metadata().additions}</span>
                    <span class="mx-0.5 text-ink-extra-muted">/</span>
                    <span class="text-failure">-{metadata().deletions}</span>
                  </span>
                </SidePanel.Pill>
              </SidePanel.Row>
            </Show>
          </SidePanel.Grid>

          <button
            type="button"
            onClick={() => openExternalUrl(metadata().url)}
            class={cn(
              'inline-flex h-7 w-fit select-none items-center gap-1.5 rounded-md px-2.5 text-xs',
              'border border-edge-muted bg-surface text-ink-muted',
              'hover:bg-hover hover:text-ink'
            )}
          >
            <GithubIcon class="size-3.5 shrink-0" />
            <span class="whitespace-nowrap">Open in GitHub</span>
            <ArrowSquareOut class="size-3 shrink-0" />
          </button>
        </div>
      </SidePanel.Section>

      <Show when={checks().length > 0}>
        <SidePanel.Section
          id="checks"
          title={
            <SidePanel.CountTitle label="Checks" count={checks().length} />
          }
          order={20}
        >
          <div class="-mx-2 flex flex-col divide-y divide-edge-muted/60">
            <For each={checks()}>{(check) => <PrCheckRow check={check} />}</For>
          </div>
        </SidePanel.Section>
      </Show>
    </>
  );
}
