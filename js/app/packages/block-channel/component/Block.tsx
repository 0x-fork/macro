import {
  doesChannelRequireJoin,
  initializeChannelData,
  isValidChannelData,
} from '@block-channel/signal/channel';
import { useBlockId } from '@core/block';
import { useChannelName } from '@core/component/ChannelsProvider';
import { DocumentBlockContainer } from '@core/component/DocumentBlockContainer';
import { useChannelQuery } from '@queries/channel/channel';
import { useJoinChannelMutation } from '@queries/channel/join';
import { useChannelRealtime } from '@queries/channel/realtime';
import { useUserId } from '@service-gql/client';
import { createEffect, createSignal, type JSXElement, Match, Switch } from 'solid-js';
import { Channel } from './Channel';
import { JoinChannelDialog } from './JoinChannelDialog';
import type { TargetMessageInfo } from './MessageList/MessageList';

export function WithTopBar(props: { children: JSXElement }) {
  return <div>{props.children}</div>;
}

export type JoinState = 'REQUIRED' | 'NOT_REQUIRED';

export type BlockChannelProps = {
  target?: TargetMessageInfo;
};

export default function BlockChannel(props: BlockChannelProps) {
  const channelId = useBlockId();
  useChannelRealtime(() => channelId);

  const channel = useChannelQuery(
    () => channelId,
    () => ({
      placeholderData: (p) => p,
    })
  );
  const userId = useUserId();

  const [error] = createSignal<string>();
  const [joinState, setJoinState] = createSignal<JoinState>();

  const joinMutation = useJoinChannelMutation({
    onSuccess: () => setJoinState('NOT_REQUIRED'),
    onError: () => setJoinState('REQUIRED'),
  });

  const validChannelData = () => {
    const blockData_ = channel.data;
    if (!blockData_) return;
    if (!isValidChannelData(blockData_)) return;
    return blockData_;
  };

  createEffect(() => {
    const data = validChannelData();
    const userId_ = userId();
    if (!data || !userId_) return;
    initializeChannelData(data);
    setJoinState(
      doesChannelRequireJoin(data, userId_) ? 'REQUIRED' : 'NOT_REQUIRED'
    );
  });

  function handleJoinChannel(
    channelId: string,
    selection: 'ACCEPTED' | 'REJECTED'
  ) {
    if (selection === 'ACCEPTED') {
      setJoinState('NOT_REQUIRED');
      joinMutation.mutate({ channelID: channelId });
    } else {
      setJoinState('REQUIRED');
    }
  }

  const channelName = () => {
    const data = channel.data;
    if (!data) return undefined;
    const id = data.channel.id;
    const name = data.channel.name;
    const maybeChannelName = useChannelName(id, name as string);
    return maybeChannelName();
  };

  return (
    <DocumentBlockContainer title={channelName() ?? 'Channel'}>
      <Switch
        fallback={
          <WithTopBar>
            <h1 />
          </WithTopBar>
        }
      >
        <Match when={error()}>
          <WithTopBar>
            <h1>{error()}</h1>
          </WithTopBar>
        </Match>
        <Match when={joinState() === 'REQUIRED' && validChannelData()}>
          {(channelData) => (
            <WithTopBar>
              <JoinChannelDialog
                channelName={channelData().channel.name ?? ''}
                participantCount={channelData().participants.length}
                onSelect={(selection) =>
                  handleJoinChannel(channelData().channel.id, selection)
                }
              />
            </WithTopBar>
          )}
        </Match>
        <Match when={joinState() === 'NOT_REQUIRED' && validChannelData()}>
          {(channelData) => (
            <Channel data={channelData()} target={props.target} />
          )}
        </Match>
      </Switch>
    </DocumentBlockContainer>
  );
}
