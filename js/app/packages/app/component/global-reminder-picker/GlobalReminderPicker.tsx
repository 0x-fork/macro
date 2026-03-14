import { DateSelector } from '@block-email/component/date-selector';
import type { EntityData } from '@entity';
import { createSignal, Show } from 'solid-js';
import { storageServiceClient } from '@service-storage/client';
import { isOk } from '@core/util/maybeResult';
import { toast } from '@core/component/Toast/Toast';

export type ReminderPickerProps = {
  entity: EntityData;
  onClose?: () => void;
};

const [pickerProps, setPickerProps] =
  createSignal<ReminderPickerProps | null>(null);

const entityTypeForApi = (entity: EntityData): string => {
  switch (entity.type) {
    case 'email':
      return 'email_thread';
    default:
      return entity.type;
  }
};

export const openReminderPicker = (props: ReminderPickerProps) => {
  setPickerProps(props);
};

export const closeReminderPicker = () => {
  const props = pickerProps();
  setPickerProps(null);
  props?.onClose?.();
};

export const GlobalReminderPicker = () => {
  const handleDateSelect = async (date: Date | null) => {
    const props = pickerProps();
    if (!props || !date) {
      closeReminderPicker();
      return;
    }

    const result = await storageServiceClient.reminders.create({
      entity_type: entityTypeForApi(props.entity),
      entity_id: props.entity.id,
      reminder_time: date.toISOString(),
    });

    if (isOk(result)) {
      toast.success('Reminder set');
    } else {
      toast.error('Failed to set reminder');
    }

    closeReminderPicker();
  };

  return (
    <Show when={pickerProps()}>
      <DateSelector
        open={true}
        onClose={closeReminderPicker}
        onSelectDate={handleDateSelect}
        placeholder="Remind me..."
        disablePriorToDate={new Date()}
        withTime
      />
    </Show>
  );
};
