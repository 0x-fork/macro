import { NonMemberChannelPreview } from '@app/features/next-soup/soup-view/non-member-channel-preview';
import { useGlobalBlockOrchestrator } from '@components/app/GlobalAppState';
import { PreviewPanel } from '@components/app/PreviewPanel';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { Resize } from '@core/component/Resize';
import EmptyStatePreviewIcon from '@design/empty-state-doc.svg';
import { type ChannelEntity, isNonMemberChannelEntity } from '@entity';
import { EmptyStatePanel } from '@ui';
import { type Accessor, type JSX, Show } from 'solid-js';
import { useSoupView } from '../context';

type SoupPreviewPaneProps = {
  root: Accessor<HTMLDivElement | undefined>;
  minSize?: number;
  targetPercent?: number;
  empty?: JSX.Element;
};

export function SoupPreviewPane(props: SoupPreviewPaneProps) {
  const panel = useSplitPanelOrThrow();
  const orchestrator = useGlobalBlockOrchestrator();
  const view = useSoupView();

  return (
    <Show when={view.previewPaneVisible()}>
      <Resize.Panel
        id="soup-preview"
        minSize={props.minSize ?? 0}
        target={{ kind: 'percent', percent: props.targetPercent ?? 70 }}
      >
        <div class="size-full">
          <Show
            when={view.previewEntity()}
            fallback={
              props.empty ?? (
                <EmptyStatePanel
                  graphic={EmptyStatePreviewIcon}
                  title="Nothing selected"
                  description="Select an item from the list to preview it here"
                  centered
                />
              )
            }
          >
            {(entity) => (
              <Show
                when={
                  isNonMemberChannelEntity(entity())
                    ? (entity() as ChannelEntity)
                    : undefined
                }
                fallback={
                  <PreviewPanel
                    selectedEntity={entity()}
                    orchestrator={orchestrator}
                    splitPanelContext={panel}
                    onFocusOut={() => props.root()?.focus()}
                  />
                }
              >
                {(channel) => <NonMemberChannelPreview entity={channel()} />}
              </Show>
            )}
          </Show>
        </div>
      </Resize.Panel>
    </Show>
  );
}
