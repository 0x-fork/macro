import { useBlockEntityCommands } from '@app/component/next-soup/actions';
import { useMaybePreviewPanel } from '@app/component/PreviewPanel';
import { useDrawerControl } from '@app/component/split-layout/components/SplitDrawerContext';
import { SplitHeaderRight } from '@app/component/split-layout/components/SplitHeader';
import { globalSplitManager } from '@app/signal/splitLayout';
import { URL_PARAMS } from '@block-channel/constants';
import {
  CallEventSync,
  ChannelCallAutoJoin,
  ChannelCallButton,
  ChannelCallTab,
  useCallContextOptional,
} from '@channel/Call';
import {
  type ChannelHandle,
  type ChannelProps,
  Channel as NewChannel,
} from '@channel/Channel/Channel';
import {
  CHANNEL_DETAILS_DRAWER_ID,
  ChannelDetailsDrawer,
} from '@channel/Channel/ChannelDetailsDrawer';
import { ChannelTabProvider } from '@channel/Channel/ChannelTabContext';
import { ChannelTopBarLiveIndicators } from '@channel/Channel/ChannelTopBarLiveIndicators';
import {
  type ChannelTabId,
  DEFAULT_CHANNEL_TAB,
} from '@channel/Channel/channel-tabs';
import {
  URL_PARAMS as CHANNEL_URL_PARAMS,
  isJoinCallRequested,
  isOpenCallTabRequested,
} from '@channel/Channel/link';
import { useBlockId } from '@core/block';
import { EntityPermissionsGate } from '@core/component/EntityPermissionsGate';
import { ENABLE_CALLS } from '@core/constant/featureFlags';
import { useChannelName, useChannelType } from '@core/context/channels';
import { createMethodRegistration } from '@core/orchestrator';
import { blockHandleSignal } from '@core/signal/load';
import { useChannelParticipantsQuery } from '@queries/channel/channel-participants';
import { useSearchParams } from '@solidjs/router';
import SidebarIcon from '@phosphor/sidebar-simple.svg';
import { Button, cn } from '@ui';
import {
  createComputed,
  createSignal,
  Match,
  onCleanup,
  onMount,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import { ChannelTopLeft } from './Top';

type ChannelTargetMessageParams = {
  [URL_PARAMS.message]?: string;
  [URL_PARAMS.thread]?: string;
  [CHANNEL_URL_PARAMS.joinCall]?: string;
  [CHANNEL_URL_PARAMS.openCallTab]?: string;
};

export type BlockChannelProps = ChannelTargetMessageParams;

type ChannelPropsTargetMessage = Pick<
  ChannelProps,
  'targetMessageId' | 'targetMessageReplyId'
>;

function ChannelHeader(props: { channelId: string }) {
  const channelName = useChannelName(props.channelId);
  const channelType = useChannelType(props.channelId);
  const participantsQuery = useChannelParticipantsQuery(() => props.channelId);
  const participants = () =>
    participantsQuery.isLoading ? [] : participantsQuery.data;
  const detailsDrawer = useDrawerControl(CHANNEL_DETAILS_DRAWER_ID);

  return (
    <Suspense>
      <ChannelTopLeft
        channelId={props.channelId}
        channelType={channelType()!}
        participants={participants() ?? []}
        channelName={channelName() ?? 'New Channel'}
        trackingIndicator={<ChannelTopBarLiveIndicators />}
      />
      <SplitHeaderRight>
        <div class="flex items-center gap-1 touch:gap-0.5">
          <Show when={ENABLE_CALLS()}>
            <ChannelCallButton channelId={props.channelId} />
          </Show>
          <Button
            class={cn('rounded-md touch:[&_svg]:size-4', detailsDrawer.isOpen() && 'bg-ink/10')}
            size="icon-sm"
            tooltip="Details"
            onClick={detailsDrawer.toggle}
          >
            <SidebarIcon class="size-4 touch:size-5" />
          </Button>
        </div>
      </SplitHeaderRight>
    </Suspense>
  );
}

export function NewChannelBlockAdapter(props: BlockChannelProps) {
  useBlockEntityCommands();

  const isPreview = !!useMaybePreviewPanel();
  const channelId = useBlockId();
  const blockHandle = blockHandleSignal.get;
  const [searchParams, setSearchParams] = useSearchParams();

  // Decide whether the user asked to auto-join the call (via ?join_call=true
  // deep link or programmatic open props) before creating signals so we
  // can land directly on the Call tab without flashing Messages first.
  // Skipped inside a preview panel so hover-previews don't auto-join.
  const wantsJoinCall =
    !isPreview &&
    (isJoinCallRequested(props[CHANNEL_URL_PARAMS.joinCall]) ||
      isJoinCallRequested(searchParams[CHANNEL_URL_PARAMS.joinCall]));

  const callCtx = useCallContextOptional();
  const hasActiveCallHere =
    callCtx?.isInCall() && callCtx.activeChannelId() === channelId;

  const [activeTab, setActiveTabInternal] = createSignal<ChannelTabId>(
    wantsJoinCall || hasActiveCallHere ? 'call' : DEFAULT_CHANNEL_TAB
  );
  const [pendingJoinCall, setPendingJoinCall] = createSignal(wantsJoinCall);

  /** Set when `<NewChannel>` mounts (Messages tab only); used for goToMessage. */
  const messagesChannelHandle: { current?: ChannelHandle } = {};

  const setActiveTab = (tab: ChannelTabId) => {
    if (tab !== 'messages') {
      messagesChannelHandle.current = undefined;
    }
    setActiveTabInternal(tab);
  };

  // CallContext: which channel has the Call tab selected (for isCallPage(), etc.).
  // `createComputed` (not `createEffect`) so this runs before paint and matches
  // `activeTab` on the first frame (e.g. deep-link opens on Call tab).
  createComputed(() => {
    if (isPreview || !callCtx) return;
    const tab = activeTab();
    callCtx.syncCallPageTab(channelId, tab === 'call');
  });

  // Nav away unmounts this block without switching tabs first — clear stale ownership.
  onCleanup(() => {
    if (isPreview || !callCtx) return;
    callCtx.syncCallPageTab(channelId, false);
  });

  // Once the call actually mounts for this channel, replace the URL so a
  // reload doesn't re-trigger auto-join after the user has left. Waiting for
  // the call to mount (instead of running on adapter mount) preserves the
  // deep link if the join fails so the user can retry by refreshing.
  createComputed(() => {
    if (!callCtx) return;
    if (!callCtx.isInCall() || callCtx.activeChannelId() !== channelId) return;
    if (searchParams[CHANNEL_URL_PARAMS.joinCall] === undefined) return;
    setSearchParams(
      { [CHANNEL_URL_PARAMS.joinCall]: undefined },
      { replace: true }
    );
  });

  const convertTargetMessage = (
    params: ChannelTargetMessageParams
  ): ChannelPropsTargetMessage => {
    const messageId = params[URL_PARAMS.message] as string | undefined;
    const threadId = params[URL_PARAMS.thread] as string | undefined;

    // For compatibility the naming is a little strange here.
    // New channels index by top level message and then separately handle replies.
    // If we have a threadId that is actually the top level message and the reply is the message id.
    const topLevelMessageId = threadId ? threadId : messageId;
    const messageReplyId = threadId ? messageId : threadId;

    return {
      targetMessageId: topLevelMessageId,
      targetMessageReplyId: messageReplyId,
    };
  };

  // Register on the block always — `goToLocationFromParams` used to live only
  // inside `onChannelReady` (Messages tab), so open-call from Attachments/etc. was a no-op.
  createMethodRegistration(blockHandle, {
    goToLocationFromParams: async (params: ChannelTargetMessageParams) => {
      if (isOpenCallTabRequested(params[CHANNEL_URL_PARAMS.openCallTab])) {
        setActiveTab('call');
        return;
      }

      const { targetMessageId, targetMessageReplyId } =
        convertTargetMessage(params);

      if (targetMessageId && messagesChannelHandle.current) {
        setActiveTab(DEFAULT_CHANNEL_TAB);
        messagesChannelHandle.current.goToMessage(
          targetMessageId,
          targetMessageReplyId
        );
      }

      if (isJoinCallRequested(params[CHANNEL_URL_PARAMS.joinCall])) {
        setActiveTab('call');
        setPendingJoinCall(true);
      }
    },
  });

  const initialTargetMessageParams = (): ChannelTargetMessageParams => {
    const hasPropsTarget =
      props[URL_PARAMS.message] !== undefined ||
      props[URL_PARAMS.thread] !== undefined;
    if (hasPropsTarget) {
      return {
        [URL_PARAMS.message]: props[URL_PARAMS.message],
        [URL_PARAMS.thread]: props[URL_PARAMS.thread],
      };
    }
    const isSingleSplit = globalSplitManager()?.splits().length === 1;
    if (!isSingleSplit) return {};
    return {
      [URL_PARAMS.message]: searchParams[URL_PARAMS.message] as
        | string
        | undefined,
      [URL_PARAMS.thread]: searchParams[URL_PARAMS.thread] as
        | string
        | undefined,
    };
  };

  const onChannelReady = (handle: ChannelHandle) => {
    messagesChannelHandle.current = handle;
  };

  return (
    <EntityPermissionsGate entityType="channel" entityId={channelId}>
      <CallEventSync />
      <ChannelTabProvider activeTab={activeTab} setActiveTab={setActiveTab}>
        <ChannelCallAutoJoin
          channelId={channelId}
          pendingJoinCall={pendingJoinCall}
          onHandled={() => setPendingJoinCall(false)}
        />
        <div class="h-full flex flex-col px-2 mobile:px-0">
          <ChannelHeader channelId={channelId} />
          {(() => {
            let containerRef!: HTMLDivElement;
            return (
              <div ref={containerRef} class="flex-1 flex flex-row min-h-0 relative">
                <div class="flex-1 min-w-0 flex flex-col">
                  <Switch>
                    <Match when={activeTab() === 'messages'}>
                      <NewChannel
                        channelId={channelId}
                        onHandleReady={onChannelReady}
                        autofocus={!isPreview}
                        {...convertTargetMessage(initialTargetMessageParams())}
                      />
                    </Match>
                    <Match when={activeTab() === 'call'}>
                      <ChannelCallTab
                        channelId={channelId}
                        pendingJoin={pendingJoinCall}
                      />
                    </Match>
                  </Switch>
                </div>
                <ChannelDetailsDrawer channelId={channelId} containerRef={() => containerRef} />
              </div>
            );
          })()}
        </div>
      </ChannelTabProvider>
    </EntityPermissionsGate>
  );
}
