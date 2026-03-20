import { tryMacroId, useDisplayName } from '@core/user';
import { UserIcon } from '@core/component/UserIcon';
import { Modal, Overlay, Content, Header, Message } from '@core/component/Modal';
import { toast } from '@core/component/Toast/Toast';
import {
  useChannelCallQuery,
  useCreateChannelCallMutation,
  useEndChannelCallMutation,
} from '@queries/channel/call';
import {
  type ChannelCallState,
  type ChannelCallType,
} from '@service-comms/client';
import PhoneCallIcon from '@phosphor-icons/core/regular/phone-call.svg?component-solid';
import PhoneDisconnectIcon from '@phosphor-icons/core/regular/phone-disconnect.svg?component-solid';
import MicrophoneIcon from '@phosphor-icons/core/regular/microphone.svg?component-solid';
import MicrophoneSlashIcon from '@phosphor-icons/core/regular/microphone-slash.svg?component-solid';
import VideoCameraIcon from '@phosphor-icons/core/regular/video-camera.svg?component-solid';
import VideoCameraSlashIcon from '@phosphor-icons/core/regular/video-camera-slash.svg?component-solid';
import XIcon from '@phosphor-icons/core/regular/x.svg?component-solid';
import { Button } from '@ui/components/Button';
import { cn } from '@ui/utils/classname';
import {
  ConnectionState,
  type Participant,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import {
  For,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
  createEffect,
  onCleanup,
} from 'solid-js';

type ChannelCallControlProps = {
  channelId: string;
  channelName: string;
};

type ParticipantTileProps = {
  participant: Participant;
  refreshToken: number;
  activeSpeaker: boolean;
  local?: boolean;
};

function participantName(participant: Participant) {
  return participant.name || participant.identity || 'Unknown participant';
}

function CallParticipantTile(props: ParticipantTileProps) {
  const macroId = createMemo(() => tryMacroId(props.participant.identity));
  const [displayName] = useDisplayName(macroId());
  const label = createMemo(() => {
    props.refreshToken;
    return displayName() || participantName(props.participant);
  });
  const cameraTrack = createMemo(() => {
    props.refreshToken;
    return props.participant.getTrackPublication(Track.Source.Camera)?.videoTrack;
  });
  const audioTrack = createMemo(() => {
    props.refreshToken;
    return props.participant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
  });
  const microphoneEnabled = createMemo(() => {
    props.refreshToken;
    return props.participant.isMicrophoneEnabled;
  });
  const cameraEnabled = createMemo(() => {
    props.refreshToken;
    return props.participant.isCameraEnabled;
  });

  let videoRef: HTMLVideoElement | undefined;
  let audioRef: HTMLAudioElement | undefined;

  createEffect(() => {
    const track = cameraTrack();
    const element = videoRef;
    if (!track || !element) return;

    element.muted = props.local ?? false;
    element.autoplay = true;
    element.playsInline = true;
    track.attach(element);

    onCleanup(() => {
      track.detach(element);
      element.srcObject = null;
    });
  });

  createEffect(() => {
    const track = audioTrack();
    const element = audioRef;
    if (!track || !element || props.local) return;

    element.autoplay = true;
    track.attach(element);

    onCleanup(() => {
      track.detach(element);
      element.srcObject = null;
    });
  });

  return (
    <div
      class={cn(
        'relative overflow-hidden rounded-2xl border border-edge-muted bg-panel/80 shadow-sm',
        props.activeSpeaker && 'ring-2 ring-accent/70'
      )}
    >
      <div class="aspect-video w-full bg-ink/5">
        <Show
          when={cameraTrack() && cameraEnabled()}
          fallback={
            <div class="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,_rgba(0,0,0,0.05),_transparent_55%),linear-gradient(135deg,_rgba(0,0,0,0.02),_rgba(0,0,0,0.08))] px-4 text-center">
              <UserIcon
                id={props.participant.identity}
                size="xl"
                suppressClick
                showTooltip={false}
              />
              <div>
                <div class="text-sm font-medium text-ink">{label()}</div>
                <div class="mt-1 text-xs text-ink-muted">
                  {props.local ? 'You are audio only' : 'Camera is off'}
                </div>
              </div>
            </div>
          }
        >
          <video ref={videoRef} class="h-full w-full object-cover" />
        </Show>
      </div>

      <audio ref={audioRef} />

      <div class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.65))] px-3 py-2 text-white">
        <div class="min-w-0">
          <div class="truncate text-sm font-medium">
            {props.local ? 'You' : label()}
          </div>
          <div class="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-white/70">
            {props.activeSpeaker ? 'Speaking' : 'Connected'}
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="rounded-full bg-black/25 p-1">
            <Show when={microphoneEnabled()} fallback={<MicrophoneSlashIcon class="size-3.5" />}>
              <MicrophoneIcon class="size-3.5" />
            </Show>
          </span>
          <Show when={!cameraEnabled()}>
            <span class="rounded-full bg-black/25 p-1">
              <VideoCameraSlashIcon class="size-3.5" />
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
}

function CallSummaryParticipants(props: { call: ChannelCallState }) {
  return (
    <div class="rounded-xl border border-edge-muted bg-panel/60 p-3">
      <div class="flex items-center justify-between">
        <div class="text-sm font-medium text-ink">Live participants</div>
        <div class="text-xs text-ink-muted">
          {props.call.participant_count}{' '}
          {props.call.participant_count === 1 ? 'person' : 'people'}
        </div>
      </div>
      <Show
        when={props.call.participants.length > 0}
        fallback={
          <div class="mt-3 rounded-lg border border-dashed border-edge-muted px-3 py-4 text-sm text-ink-muted">
            Nobody is connected right now.
          </div>
        }
      >
        <div class="mt-3 space-y-2">
          <For each={props.call.participants}>
            {(participant) => (
              <div class="flex items-center gap-2 rounded-lg bg-page/70 px-2.5 py-2">
                <UserIcon
                  id={participant.identity}
                  size="sm"
                  suppressClick
                  showTooltip={false}
                />
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium text-ink">
                    {participant.name || participant.identity}
                  </div>
                  <div class="text-xs text-ink-muted">
                    {participant.metadata || 'In call'}
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export function ChannelCallControl(props: ChannelCallControlProps) {
  const [open, setOpen] = createSignal(false);
  const [room, setRoom] = createSignal<Room>();
  const [callMode, setCallMode] = createSignal<ChannelCallType>('voice');
  const [participantVersion, setParticipantVersion] = createSignal(0);
  const [connectionState, setConnectionState] = createSignal(
    ConnectionState.Disconnected
  );
  const [activeSpeakerIds, setActiveSpeakerIds] = createSignal<Set<string>>(
    new Set()
  );
  const [callError, setCallError] = createSignal<string>();

  const callQuery = useChannelCallQuery(() => props.channelId);
  const createCallMutation = useCreateChannelCallMutation();
  const endCallMutation = useEndChannelCallMutation();

  let cleanupRoomListeners: (() => void) | undefined;

  const inRoom = createMemo(
    () => connectionState() === ConnectionState.Connected && !!room()
  );
  const currentCall = createMemo(() => callQuery.data);
  const displayCallType = createMemo<ChannelCallType>(() => {
    return currentCall()?.call_type ?? callMode();
  });
  const participants = createMemo(() => {
    participantVersion();
    const currentRoom = room();
    if (!currentRoom) return [];
    return [
      currentRoom.localParticipant,
      ...Array.from(currentRoom.remoteParticipants.values()),
    ];
  });
  const isBusy = createMemo(
    () =>
      createCallMutation.isPending ||
      endCallMutation.isPending ||
      connectionState() === ConnectionState.Connecting
  );
  const toolbarLabel = createMemo(() => {
    if (inRoom()) return 'Open call';
    if (currentCall()?.status === 'active') return 'Join call';
    return 'Start call';
  });

  async function disconnectRoom(closeModal = false) {
    cleanupRoomListeners?.();
    cleanupRoomListeners = undefined;

    const currentRoom = room();
    setRoom(undefined);
    setConnectionState(ConnectionState.Disconnected);
    setActiveSpeakerIds(new Set<string>());
    setParticipantVersion((value) => value + 1);

    if (currentRoom) {
      try {
        await currentRoom.disconnect();
      } catch (error) {
        console.error('failed to disconnect LiveKit room', error);
      }
    }

    if (closeModal) {
      setOpen(false);
    }

    void callQuery.refetch();
  }

  function bindRoom(nextRoom: Room) {
    cleanupRoomListeners?.();

    const refreshRoom = () => {
      setParticipantVersion((value) => value + 1);
      setConnectionState(nextRoom.state);
      setActiveSpeakerIds(
        new Set(nextRoom.activeSpeakers.map((participant) => participant.identity))
      );
    };

    const handleDisconnected = () => {
      setConnectionState(ConnectionState.Disconnected);
      setActiveSpeakerIds(new Set<string>());
      setParticipantVersion((value) => value + 1);
      setRoom(undefined);
      void callQuery.refetch();
    };

    const handleActiveSpeakersChanged = (participants: Participant[]) => {
      setActiveSpeakerIds(new Set(participants.map((participant) => participant.identity)));
      setParticipantVersion((value) => value + 1);
    };

    nextRoom.on(RoomEvent.ConnectionStateChanged, setConnectionState);
    nextRoom.on(RoomEvent.ParticipantConnected, refreshRoom);
    nextRoom.on(RoomEvent.ParticipantDisconnected, refreshRoom);
    nextRoom.on(RoomEvent.TrackSubscribed, refreshRoom);
    nextRoom.on(RoomEvent.TrackUnsubscribed, refreshRoom);
    nextRoom.on(RoomEvent.LocalTrackPublished, refreshRoom);
    nextRoom.on(RoomEvent.LocalTrackUnpublished, refreshRoom);
    nextRoom.on(RoomEvent.TrackMuted, refreshRoom);
    nextRoom.on(RoomEvent.TrackUnmuted, refreshRoom);
    nextRoom.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
    nextRoom.on(RoomEvent.Disconnected, handleDisconnected);

    cleanupRoomListeners = () => {
      nextRoom.off(RoomEvent.ConnectionStateChanged, setConnectionState);
      nextRoom.off(RoomEvent.ParticipantConnected, refreshRoom);
      nextRoom.off(RoomEvent.ParticipantDisconnected, refreshRoom);
      nextRoom.off(RoomEvent.TrackSubscribed, refreshRoom);
      nextRoom.off(RoomEvent.TrackUnsubscribed, refreshRoom);
      nextRoom.off(RoomEvent.LocalTrackPublished, refreshRoom);
      nextRoom.off(RoomEvent.LocalTrackUnpublished, refreshRoom);
      nextRoom.off(RoomEvent.TrackMuted, refreshRoom);
      nextRoom.off(RoomEvent.TrackUnmuted, refreshRoom);
      nextRoom.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
      nextRoom.off(RoomEvent.Disconnected, handleDisconnected);
    };
  }

  async function joinCall(mode: ChannelCallType) {
    setCallError(undefined);
    setCallMode(mode);

    try {
      const response = await createCallMutation.mutateAsync({
        channelId: props.channelId,
        callType: mode,
      });

      await disconnectRoom();

      const nextRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      bindRoom(nextRoom);
      setRoom(nextRoom);
      setConnectionState(ConnectionState.Connecting);
      await nextRoom.connect(response.server_url, response.token);
      await nextRoom.localParticipant.setMicrophoneEnabled(true);
      await nextRoom.localParticipant.setCameraEnabled(mode === 'video');
      setParticipantVersion((value) => value + 1);
      void callQuery.refetch();
    } catch (error) {
      console.error('failed to join channel call', error);
      const message =
        error instanceof Error ? error.message : 'Unable to join the call';
      setCallError(message);
      toast.failure('Unable to join the call');
      await disconnectRoom();
    }
  }

  async function toggleMicrophone() {
    const currentRoom = room();
    if (!currentRoom) return;

    try {
      await currentRoom.localParticipant.setMicrophoneEnabled(
        !currentRoom.localParticipant.isMicrophoneEnabled
      );
      setParticipantVersion((value) => value + 1);
    } catch (error) {
      console.error('failed to toggle microphone', error);
      toast.failure('Unable to update microphone');
    }
  }

  async function toggleCamera() {
    const currentRoom = room();
    if (!currentRoom) return;

    try {
      const nextEnabled = !currentRoom.localParticipant.isCameraEnabled;
      await currentRoom.localParticipant.setCameraEnabled(nextEnabled);
      setCallMode(nextEnabled ? 'video' : 'voice');
      setParticipantVersion((value) => value + 1);
    } catch (error) {
      console.error('failed to toggle camera', error);
      toast.failure('Unable to update camera');
    }
  }

  async function endCall() {
    try {
      await endCallMutation.mutateAsync({ channelId: props.channelId });
      await disconnectRoom(true);
    } catch (error) {
      console.error('failed to end channel call', error);
      toast.failure('Unable to end the call');
    }
  }

  createEffect(() => {
    if (open()) return;
    if (inRoom()) {
      void disconnectRoom();
    }
  });

  onCleanup(() => {
    void disconnectRoom();
  });

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        tooltip={toolbarLabel()}
        variant={currentCall()?.status === 'active' || inRoom() ? 'accent' : 'ghost'}
        size="icon-sm"
        class="relative"
      >
        <Show when={displayCallType() === 'video'} fallback={<PhoneCallIcon />}>
          <VideoCameraIcon />
        </Show>
        <Show when={currentCall()?.status === 'active'}>
          <span class="absolute -right-1 -top-1 min-h-4 min-w-4 rounded-full bg-ink px-1 text-[10px] font-semibold leading-4 text-page">
            {Math.max(currentCall()?.participant_count ?? 0, 1)}
          </span>
        </Show>
      </Button>

      <Modal open={open()} onOpenChange={setOpen}>
        <Overlay class="p-4">
          <Content class="min-w-0 w-[min(72rem,calc(100vw-2rem))] max-w-none overflow-hidden p-0">
            <div class="flex items-start justify-between border-b border-edge-muted px-5 py-4">
              <div>
                <Header class="text-xl">
                  {inRoom()
                    ? `${displayCallType() === 'video' ? 'Video' : 'Voice'} call`
                    : props.channelName || 'Channel call'}
                </Header>
                <Message class="mt-1">
                  {inRoom()
                    ? 'Manage your camera, microphone, and participants in one place.'
                    : 'Start a LiveKit-powered voice or video call for this conversation.'}
                </Message>
              </div>
              <Button
                onClick={() => setOpen(false)}
                variant="ghost"
                size="icon-sm"
                tooltip="Close"
              >
                <XIcon />
              </Button>
            </div>

            <div class="grid min-h-[32rem] gap-0 lg:grid-cols-[minmax(0,2fr)_22rem]">
              <div class="bg-panel p-5">
                <Switch>
                  <Match when={inRoom()}>
                    <div
                      class={cn(
                        'grid gap-3',
                        participants().length <= 1
                          ? 'grid-cols-1'
                          : participants().length === 2
                            ? 'grid-cols-1 md:grid-cols-2'
                            : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                      )}
                    >
                      <For each={participants()}>
                        {(participant) => (
                          <CallParticipantTile
                            participant={participant}
                            refreshToken={participantVersion()}
                            local={participant.identity === room()?.localParticipant.identity}
                            activeSpeaker={activeSpeakerIds().has(participant.identity)}
                          />
                        )}
                      </For>
                    </div>
                  </Match>

                  <Match when={currentCall()?.status === 'active'}>
                    <div class="flex h-full flex-col justify-between gap-4">
                      <div class="rounded-2xl border border-edge-muted bg-[radial-gradient(circle_at_top,_rgba(19,131,117,0.09),_transparent_55%),linear-gradient(180deg,_rgba(255,255,255,0.94),_rgba(246,247,245,0.96))] p-5">
                        <div class="flex items-center gap-3">
                          <div class="rounded-2xl bg-accent/15 p-3 text-accent-ink">
                            <Show when={displayCallType() === 'video'} fallback={<PhoneCallIcon class="size-6" />}>
                              <VideoCameraIcon class="size-6" />
                            </Show>
                          </div>
                          <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                              Call in progress
                            </div>
                            <div class="mt-1 text-2xl font-semibold text-ink">
                              {props.channelName || 'Conversation'}
                            </div>
                          </div>
                        </div>
                        <div class="mt-5 grid gap-3 sm:grid-cols-2">
                          <Button
                            onClick={() => void joinCall('voice')}
                            variant="secondary"
                            class="justify-start gap-2"
                            disabled={isBusy()}
                          >
                            <PhoneCallIcon />
                            Join with audio
                          </Button>
                          <Button
                            onClick={() => void joinCall('video')}
                            variant="accent"
                            class="justify-start gap-2"
                            disabled={isBusy()}
                          >
                            <VideoCameraIcon />
                            Join with video
                          </Button>
                        </div>
                      </div>

                      <CallSummaryParticipants call={currentCall()!} />
                    </div>
                  </Match>

                  <Match when={true}>
                    <div class="flex h-full flex-col justify-between gap-4">
                      <div class="rounded-2xl border border-edge-muted bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.12),_transparent_55%),linear-gradient(180deg,_rgba(255,255,255,0.95),_rgba(244,246,250,0.98))] p-5">
                        <div class="max-w-xl">
                          <div class="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                            Calling is ready
                          </div>
                          <div class="mt-2 text-3xl font-semibold text-ink">
                            Voice and video for {props.channelName || 'this channel'}
                          </div>
                          <div class="mt-3 text-sm leading-6 text-ink-muted">
                            Start with audio only or jump straight into video.
                            Everyone in the channel or DM joins the same room.
                          </div>
                        </div>
                        <div class="mt-6 grid gap-3 sm:grid-cols-2">
                          <Button
                            onClick={() => void joinCall('voice')}
                            variant="secondary"
                            class="justify-start gap-2"
                            disabled={isBusy()}
                          >
                            <PhoneCallIcon />
                            Start voice call
                          </Button>
                          <Button
                            onClick={() => void joinCall('video')}
                            variant="accent"
                            class="justify-start gap-2"
                            disabled={isBusy()}
                          >
                            <VideoCameraIcon />
                            Start video call
                          </Button>
                        </div>
                      </div>

                      <div class="grid gap-3 md:grid-cols-2">
                        <div class="rounded-xl border border-edge-muted bg-panel/60 p-4">
                          <div class="text-sm font-medium text-ink">Low friction</div>
                          <div class="mt-2 text-sm leading-6 text-ink-muted">
                            Calls are scoped to the current channel or DM, so you
                            do not need a separate meeting link.
                          </div>
                        </div>
                        <div class="rounded-xl border border-edge-muted bg-panel/60 p-4">
                          <div class="text-sm font-medium text-ink">LiveKit media</div>
                          <div class="mt-2 text-sm leading-6 text-ink-muted">
                            Audio, video, and participant presence are handled in
                            the same room with secure server-issued tokens.
                          </div>
                        </div>
                      </div>
                    </div>
                  </Match>
                </Switch>
              </div>

              <div class="border-l border-edge-muted bg-page/70 p-5">
                <div class="rounded-xl border border-edge-muted bg-panel/70 p-4">
                  <div class="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                    Status
                  </div>
                  <div class="mt-3 text-2xl font-semibold text-ink">
                    <Switch>
                      <Match when={connectionState() === ConnectionState.Connecting}>
                        Connecting
                      </Match>
                      <Match when={inRoom()}>Connected</Match>
                      <Match when={currentCall()?.status === 'active'}>
                        Waiting to join
                      </Match>
                      <Match when={true}>Ready to start</Match>
                    </Switch>
                  </div>
                  <div class="mt-2 text-sm text-ink-muted">
                    {currentCall()?.participant_count ?? participants().length}{' '}
                    active participant
                    {(currentCall()?.participant_count ?? participants().length) === 1
                      ? ''
                      : 's'}
                  </div>
                  <Show when={currentCall()?.started_at}>
                    <div class="mt-4 rounded-lg bg-page/80 px-3 py-2 text-xs text-ink-muted">
                      Started {new Date(currentCall()!.started_at!).toLocaleString()}
                    </div>
                  </Show>
                </div>

                <div class="mt-4 space-y-3">
                  <Show when={inRoom()}>
                    <div class="grid gap-3">
                      <Button
                        onClick={() => void toggleMicrophone()}
                        variant="secondary"
                        class="justify-start gap-2"
                      >
                        <Show
                          when={room()?.localParticipant.isMicrophoneEnabled}
                          fallback={<MicrophoneSlashIcon />}
                        >
                          <MicrophoneIcon />
                        </Show>
                        {room()?.localParticipant.isMicrophoneEnabled
                          ? 'Mute microphone'
                          : 'Unmute microphone'}
                      </Button>

                      <Button
                        onClick={() => void toggleCamera()}
                        variant="secondary"
                        class="justify-start gap-2"
                      >
                        <Show
                          when={room()?.localParticipant.isCameraEnabled}
                          fallback={<VideoCameraIcon />}
                        >
                          <VideoCameraSlashIcon />
                        </Show>
                        {room()?.localParticipant.isCameraEnabled
                          ? 'Turn camera off'
                          : 'Turn camera on'}
                      </Button>

                      <Button
                        onClick={() => void disconnectRoom(true)}
                        variant="secondary"
                        class="justify-start gap-2"
                      >
                        <PhoneDisconnectIcon />
                        Leave call
                      </Button>
                    </div>
                  </Show>

                  <Show when={currentCall()?.status === 'active'}>
                    <Button
                      onClick={() => void endCall()}
                      variant="destructive"
                      class="w-full justify-start gap-2"
                      disabled={endCallMutation.isPending}
                    >
                      <PhoneDisconnectIcon />
                      End call for everyone
                    </Button>
                  </Show>
                </div>

                <Show when={callQuery.isFetching}>
                  <div class="mt-4 text-xs text-ink-muted">Refreshing call state...</div>
                </Show>

                <Show when={callError()}>
                  <div class="mt-4 rounded-lg border border-failure/30 bg-failure/10 px-3 py-2 text-sm text-failure">
                    {callError()}
                  </div>
                </Show>
              </div>
            </div>
          </Content>
        </Overlay>
      </Modal>
    </>
  );
}
