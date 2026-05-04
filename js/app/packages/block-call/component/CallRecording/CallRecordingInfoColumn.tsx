import UsersThree from '@phosphor-icons/core/assets/regular/users-three.svg';
import type { CallRecord } from '@service-storage/generated/schemas/callRecord';
import type { Accessor } from 'solid-js';
import { cn } from '@ui/utils/classname';
import { CallRecordingParticipantsSection } from './CallRecordingParticipants';
import { CallRecordingSectionShell } from './CallRecordingSectionShell';
import { CallRecordingSummarySection } from './CallRecordingSummary';

/** Right column (wide) / middle stack (narrow): summary + participants. */
export function CallRecordingInfoColumn(props: {
  record: Accessor<CallRecord>;
  isStacked: Accessor<boolean>;
  participantsOpen: Accessor<boolean>;
  onToggleParticipants: () => void;
}) {
  return (
    <div
      class={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        !props.isStacked() && 'border-l border-edge-muted/50'
      )}
    >
      <CallRecordingSummarySection record={props.record} />
      <CallRecordingSectionShell
        title="Participants"
        icon={<UsersThree class="size-4 text-ink shrink-0" />}
        open={props.participantsOpen()}
        accordion
        accordionOpenMaxVh={38}
        onToggle={props.onToggleParticipants}
      >
        <CallRecordingParticipantsSection
          record={props.record}
          withShell={false}
        />
      </CallRecordingSectionShell>
    </div>
  );
}
