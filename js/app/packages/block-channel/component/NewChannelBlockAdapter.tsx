import {
  Channel as NewChannel,
  type ChannelHandle,
  type ChannelProps,
} from '@channel/Channel/Channel';
import { ChannelTopBarLiveIndicators } from '@channel/Channel/ChannelTopBarLiveIndicators';
import { ChannelParticipantsIndicator } from '@channel/Participants/ChannelParticipantsIndicator';
import { useUserIndicators } from '@core/state/liveIndicators';
import { ChannelTabProvider } from '@channel/Channel/ChannelTabContext';
import {
  isJoinCallRequested,
  isOpenCallTabRequested,
  URL_PARAMS as CHANNEL_URL_PARAMS,
} from '@channel/Channel/link';
import { useBlockId } from '@core/block';
import { EntityPermissionsGate } from '@core/component/EntityPermissionsGate';
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
import { useSearchParams } from '@solidjs/router';
import { blockHandleSignal } from '@core/signal/load';
import { createMethodRegistration } from '@core/orchestrator';
import { URL_PARAMS } from '@block-channel/constants';
import { useBlockEntityCommands } from '@app/component/next-soup/actions';
import { ChannelTopLeft } from './Top';
import { useChannelName, useChannelType } from '@core/context/channels';
import { ChannelTypeEnum } from '@service-comms/client';
import { useChannelParticipantsQuery } from '@queries/channel/channel-participants';
import {
  DEFAULT_CHANNEL_TAB,
  type ChannelTabId,
} from '@channel/Channel/channel-tabs';
import {
  ChannelDetailsDrawer,
  CHANNEL_DETAILS_DRAWER_ID,
} from '@channel/Channel/ChannelDetailsDrawer';
import { useDrawerControl } from '@app/component/split-layout/components/SplitDrawerContext';
import SidebarIcon from '@icon/regular/sidebar-simple.svg';
import { Button } from '@ui/components/Button';
import { cn } from '@ui/utils/classname';
import {
  CallEventSync,
  ChannelCallAutoJoin,
  ChannelCallButton,
  ChannelCallTab,
  useCallContextOptional,
} from '@channel/Call';
import { ENABLE_CALLS } from '@core/constant/featureFlags';
import {
  ChatWithAgentButton,
  toChatChannelType,
} from '@app/component/ChatWithAgentButton';
import { SplitHeaderRight } from '@app/component/split-layout/components/SplitHeader';
import { useMaybePreviewPanel } from '@app/component/PreviewPanel';
import { globalSplitManager } from '@app/signal/splitLayout';

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
  const chatChannelType = () => toChatChannelType(channelType());
  const participantsQuery = useChannelParticipantsQuery(() => props.channelId);
  const participants = () =>
    participantsQuery.isLoading ? [] : participantsQuery.data;
  const detailsDrawer = useDrawerControl(CHANNEL_DETAILS_DRAWER_ID);
  const showParticipants = () =>
    channelType() !== ChannelTypeEnum.DirectMessage;
  const activeUserIds = useUserIndicators();

  const callButton = () => (
    <Show when={ENABLE_CALLS()}>
      <ChannelCallButton channelId={props.channelId} />
    </Show>
  );

  return (
    <Suspense>
      <ChannelTopLeft
        channelId={props.channelId}
        channelType={channelType()!}
        participants={participants() ?? []}
        channelName={channelName() ?? 'New Channel'}
        callButton={callButton()}
        trackingIndicator={<ChannelTopBarLiveIndicators />}
      />
      <SplitHeaderRight>
        <div class="flex items-center gap-1">
          <Show when={chatChannelType()}>
            {(type) => (
              <ChatWithAgentButton
                entity={{
                  type: 'channel',
                  id: props.channelId,
                  name: channelName() ?? 'Channel',
                  channelType: type(),
                }}
              />
            )}
          </Show>
          <Show when={showParticipants()}>
            <ChannelParticipantsIndicator
              channelId={props.channelId}
              participants={participants() ?? []}
              activeUserIds={activeUserIds() ?? []}
            />
          </Show>
          <Button
            class={cn('rounded-md', detailsDrawer.isOpen() && 'bg-ink/10')}
            size="icon-sm"
            tooltip="Details"
            onClick={detailsDrawer.toggle}
          >
            <SidebarIcon class="size-4" />
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

  // Clear the URL param after consuming it so a reload doesn't re-trigger
  // the join if the user has since left the call.
  onMount(() => {
    if (
      wantsJoinCall &&
      searchParams[CHANNEL_URL_PARAMS.joinCall] !== undefined
    ) {
      setSearchParams(
        { [CHANNEL_URL_PARAMS.joinCall]: undefined },
        { replace: true }
      );
    }
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
        await messagesChannelHandle.current.goToMessage(
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
