import type { CallRecord } from '@service-storage/generated/schemas/callRecord';
import type { Accessor, Setter } from 'solid-js';
import { Show } from 'solid-js';
import { CallRecordingVideo } from './CallRecordingVideo';

export type CallRecordingTimeUpdateSource = 'playback' | 'seeking' | 'seeked';

/** Top-left column (wide) / first stack item (narrow): recording video and fallbacks. */
export function CallRecordingMediaColumn(props: {
  record: Accessor<CallRecord>;
  hasTranscripts: Accessor<boolean>;
  onTimeUpdate: (
    seconds: number,
    source: CallRecordingTimeUpdateSource
  ) => void;
  setVideoRef: Setter<HTMLVideoElement | undefined>;
}) {
  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Show when={props.record().recordingUrl}>
        {(url) => (
          <div class="min-h-0 flex-1 overflow-hidden">
            <CallRecordingVideo
              url={url()}
              onTimeUpdate={props.onTimeUpdate}
              setVideoRef={props.setVideoRef}
            />
          </div>
        )}
      </Show>
      <Show when={!props.record().recordingUrl}>
        <Show
          when={props.hasTranscripts()}
          fallback={
            <div class="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-sm text-ink-faint">
              No recording or transcript available.
            </div>
          }
        >
          <div class="flex min-h-[120px] flex-1 items-center justify-center px-4 text-center text-sm text-ink-faint">
            No video recording for this call.
          </div>
        </Show>
      </Show>
    </div>
  );
}
