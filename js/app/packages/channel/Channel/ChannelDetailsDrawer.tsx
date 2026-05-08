import { useDrawerControl } from '@app/component/split-layout/components/SplitDrawerContext';
import { LabelAndHotKey } from '@core/component/Tooltip';
import { ChannelMediaTab } from '@channel/Attachments/ChannelMediaTab';
import { ChannelDocumentsTab } from '@channel/Attachments/ChannelDocumentsTab';
import { createSignal, createEffect, createMemo, type Accessor, For, Match, Show, Suspense, Switch } from 'solid-js';
import { Portal } from 'solid-js/web';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import { Button, Layer } from '@ui';
import { cn } from '@ui/utils/classname';
import { UserIcon } from '@core/component/UserIcon';
import { idToEmail } from '@core/user';
import { useChannelParticipantsQuery } from '@queries/channel/channel-participants';
import { useUserIndicators } from '@core/state/liveIndicators';
import { useUserId } from '@core/context/user';
import CloseIcon from '@icon/regular/x.svg';
import SearchIcon from '@icon/regular/magnifying-glass.svg';

export const CHANNEL_DETAILS_DRAWER_ID = 'channel-details';

type DetailsTab = 'participants' | 'media' | 'documents';

const NARROW_BREAKPOINT = 600;

function ParticipantsTab(props: { channelId: string }) {
  const [searchQuery, setSearchQuery] = createSignal('');
  const currentUserId = useUserId();
  const participantsQuery = useChannelParticipantsQuery(() => props.channelId);
  const participants = () => participantsQuery.data ?? [];
  const activeUserIds = useUserIndicators();

  const activeUserIdsExcludingSelf = createMemo(() =>
    (activeUserIds() ?? []).filter((id) => id !== currentUserId())
  );

  const filteredParticipants = createMemo(() => {
    const query = searchQuery().trim().toLowerCase();
    if (query.length === 0) return participants();
    return participants().filter((p) => {
      const email = idToEmail(p.user_id).toLowerCase();
      return email.includes(query) || p.role.toLowerCase().includes(query);
    });
  });

  const activeParticipants = createMemo(() =>
    filteredParticipants().filter((p) =>
      activeUserIdsExcludingSelf().includes(p.user_id)
    )
  );

  const otherParticipants = createMemo(() =>
    filteredParticipants().filter(
      (p) => !activeUserIdsExcludingSelf().includes(p.user_id)
    )
  );

  return (
    <div class="flex flex-col h-full">
      <div class="pb-3 shrink-0">
        <div class="relative">
          <SearchIcon class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-faint z-10 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter by name or role"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="w-full pl-8 pr-3 py-1.5 text-sm bg-ink/5 rounded-md focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-ink-faint"
          />
        </div>
      </div>
      <div class="overflow-y-auto flex-1">
        <Show when={activeParticipants().length > 0}>
          <div class="text-xs font-medium text-ink-muted py-1.5 uppercase tracking-wide">
            Active
          </div>
          <For each={activeParticipants()}>
            {(participant) => (
              <div class="flex items-center gap-3 py-2">
                <div class="relative shrink-0">
                  <UserIcon id={participant.user_id} size="sm" />
                  <div class="absolute -bottom-0.5 -right-0.5 size-2.5 bg-green-500 rounded-full border-2 border-panel" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">
                    {idToEmail(participant.user_id).split('@')[0]}
                  </div>
                  <div class="text-xs text-ink-muted capitalize">
                    {participant.role}
                  </div>
                </div>
              </div>
            )}
          </For>
        </Show>
        <Show when={otherParticipants().length > 0}>
          <Show when={activeParticipants().length > 0}>
            <div class="text-xs font-medium text-ink-muted py-1.5 mt-2 uppercase tracking-wide">
              Members
            </div>
          </Show>
          <For each={otherParticipants()}>
            {(participant) => (
              <div class="flex items-center gap-3 py-2">
                <UserIcon id={participant.user_id} size="sm" />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">
                    {idToEmail(participant.user_id).split('@')[0]}
                  </div>
                  <div class="text-xs text-ink-muted capitalize">
                    {participant.role}
                  </div>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

function DrawerContent(props: { channelId: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = createSignal<DetailsTab>('participants');

  return (
    <div class="h-full flex flex-col">
      <div class="flex items-center justify-between gap-2 shrink-0 px-4 py-3 relative z-10">
        <div class="flex items-center gap-1">
          <button
            type="button"
            class={cn(
              'px-3 py-1 text-sm rounded-sm transition-colors',
              activeTab() === 'participants'
                ? 'bg-ink/10 text-ink'
                : 'text-ink-extra-muted hover:text-ink hover:bg-ink/5'
            )}
            onClick={() => setActiveTab('participants')}
          >
            People
          </button>
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
          <Match when={activeTab() === 'participants'}>
            <Suspense>
              <ParticipantsTab channelId={props.channelId} />
            </Suspense>
          </Match>
          <Match when={activeTab() === 'media'}>
            <Suspense>
              <ChannelMediaTab channelId={props.channelId} />
            </Suspense>
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
