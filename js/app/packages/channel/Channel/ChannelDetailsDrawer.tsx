import { useDrawerControl } from '@app/component/split-layout/components/SplitDrawerContext';
import { LabelAndHotKey } from '@core/component/Tooltip';
import { ChannelMediaTab } from '@channel/Attachments/ChannelMediaTab';
import { ChannelDocumentsTab } from '@channel/Attachments/ChannelDocumentsTab';
import { createSignal, createEffect, type Accessor, Match, Show, Suspense, Switch } from 'solid-js';
import { Portal } from 'solid-js/web';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import { Button, Layer } from '@ui';
import { cn } from '@ui/utils/classname';
import CloseIcon from '@icon/regular/x.svg';

export const CHANNEL_DETAILS_DRAWER_ID = 'channel-details';

type DetailsTab = 'media' | 'documents';

const NARROW_BREAKPOINT = 600;

function DrawerContent(props: { channelId: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = createSignal<DetailsTab>('media');

  return (
    <div class="h-full flex flex-col">
      <div class="flex items-center justify-between gap-2 shrink-0 px-4 py-3 relative z-10">
        <div class="flex items-center gap-1">
          <button
            type="button"
            class={cn(
              'px-3 py-1 text-sm rounded-sm transition-colors',
              activeTab() === 'media'
                ? 'bg-ink/10 text-ink'
                : 'text-ink-extra-muted hover:text-ink hover:bg-ink/5'
            )}
            onClick={() => setActiveTab('media')}
          >
            Media
          </button>
          <button
            type="button"
            class={cn(
              'px-3 py-1 text-sm rounded-sm transition-colors',
              activeTab() === 'documents'
                ? 'bg-ink/10 text-ink'
                : 'text-ink-extra-muted hover:text-ink hover:bg-ink/5'
            )}
            onClick={() => setActiveTab('documents')}
          >
            Documents
          </button>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={<LabelAndHotKey label="Close" />}
          onClick={props.onClose}
        >
          <CloseIcon class="size-4" />
        </Button>
      </div>
      <div class="flex-1 overflow-y-auto px-4 pb-4 pt-1">
        <Switch>
          <Match when={activeTab() === 'media'}>
            <ChannelMediaTab channelId={props.channelId} />
          </Match>
          <Match when={activeTab() === 'documents'}>
            <Suspense>
              <ChannelDocumentsTab channelId={props.channelId} />
            </Suspense>
          </Match>
        </Switch>
      </div>
    </div>
  );
}

export function ChannelDetailsDrawer(props: {
  channelId: string;
  containerRef: Accessor<HTMLDivElement>;
}) {
  const drawerControl = useDrawerControl(CHANNEL_DETAILS_DRAWER_ID);
  const isOpen = () => drawerControl.isOpen();
  const [isNarrow, setIsNarrow] = createSignal(false);

  createEffect(() => {
    const container = props.containerRef();
    if (!container) return;

    const updateWidth = () => {
      setIsNarrow(container.offsetWidth < NARROW_BREAKPOINT);
    };

    updateWidth();
    createResizeObserver(container, updateWidth);
  });

  return (
    <>
      {/* Wide container: inline drawer that pushes content */}
      <Show when={!isNarrow()}>
        <div
          class={cn(
            'h-full shrink-0 w-96 py-2 pr-1 pl-2 transition-[margin] duration-200 ease-out',
            isOpen() ? 'mr-0' : '-mr-96'
          )}
        >
          <Layer depth={3}>
            <div
              class={cn(
                'h-full w-full bg-panel rounded-lg overflow-hidden transition-transform duration-200 ease-out ring-1 ring-edge-muted shadow-md',
                isOpen() ? 'translate-x-0' : 'translate-x-full'
              )}
            >
              <DrawerContent channelId={props.channelId} onClose={drawerControl.close} />
            </div>
          </Layer>
        </div>
      </Show>

      {/* Narrow container: overlay drawer mounted to container */}
      <Show when={isNarrow()}>
        <Portal mount={props.containerRef()}>
          <div
            class={cn(
              'absolute inset-0 z-50 transition-opacity duration-200',
              isOpen() ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            <div
              class="absolute inset-0 bg-black/30"
              onClick={drawerControl.close}
            />
            <Layer depth={3}>
              <div
                class={cn(
                  'absolute inset-0 bg-panel transition-transform duration-200 ease-out ring-1 ring-edge-muted shadow-md',
                  isOpen() ? 'translate-x-0' : 'translate-x-full'
                )}
              >
                <DrawerContent channelId={props.channelId} onClose={drawerControl.close} />
              </div>
            </Layer>
          </div>
        </Portal>
      </Show>
    </>
  );
}
