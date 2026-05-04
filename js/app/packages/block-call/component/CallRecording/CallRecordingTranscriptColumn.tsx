import Subtitles from '@phosphor-icons/core/assets/regular/subtitles.svg';
import type { CallRecord } from '@service-storage/generated/schemas/callRecord';
import type { Accessor } from 'solid-js';
import { Show } from 'solid-js';
import { cn } from '@ui/utils/classname';
import { CallTranscript } from '../CallTranscript';
import { CallRecordingSectionShell } from './CallRecordingSectionShell';

/** Bottom section (wide) / final stack item (narrow): transcript. */
export function CallRecordingTranscriptColumn(props: {
  record: Accessor<CallRecord>;
  hasTranscripts: Accessor<boolean>;
  isStacked: Accessor<boolean>;
  transcriptOpen: Accessor<boolean>;
  activeSequenceNum: Accessor<number | null>;
  timelineStartMs: Accessor<number | null>;
  videoSeekGeneration: Accessor<number>;
  onToggleTranscript: () => void;
  onSeekToSeconds: (seconds: number) => void;
}) {
  return (
    <div
      class={cn(
        'relative flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-edge-muted/50'
      )}
    >
      <Show
        when={props.hasTranscripts()}
        fallback={
          <div class="flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center px-4 py-10 text-center text-sm text-ink-muted">
            No transcripts for this call.
          </div>
        }
      >
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <CallRecordingSectionShell
            title="Transcript"
            icon={<Subtitles class="size-4 text-ink shrink-0" />}
            open={props.transcriptOpen()}
            accordion={props.isStacked()}
            accordionOpenMaxVh={52}
            onToggle={props.isStacked() ? props.onToggleTranscript : undefined}
            class="border-t-0"
          >
            <CallTranscript
              transcript={props.record().transcript}
              channelId={props.record().channelId}
              timelineStartMs={props.timelineStartMs()}
              activeSequenceNum={props.activeSequenceNum()}
              videoSeekGeneration={props.videoSeekGeneration()}
              onSeekToSeconds={props.onSeekToSeconds}
              hideHeader
            />
          </CallRecordingSectionShell>
        </div>
      </Show>
    </div>
  );
}
