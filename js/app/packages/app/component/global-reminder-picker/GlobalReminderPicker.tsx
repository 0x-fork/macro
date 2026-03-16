import { DateSelector } from '@block-email/component/date-selector';
import type { EntityData } from '@entity';
import { createEffect, createSignal, on, Show } from 'solid-js';
import { storageServiceClient } from '@service-storage/client';
import { isOk } from '@core/util/maybeResult';
import { toast } from '@core/component/Toast/Toast';

export type ReminderPickerProps = {
  entity: EntityData;
  onClose?: () => void;
  /** Called after the reminder is successfully created. */
  onReminderCreated?: (date: Date) => void;
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
  // Delay opening the DateSelector by a tick so that the command menu's
  // close/focus-return completes before the Combobox mounts.
  const [ready, setReady] = createSignal(false);

  createEffect(
    on(
      () => pickerProps(),
      (props) => {
        if (props) {
          setReady(false);
          // Delay mounting the DateSelector so the command menu fully closes
          // (focus return, animations, controlled-open-signal cleanup) before
          // the Combobox takes over focus.
          setTimeout(() => setReady(true), 150);
        } else {
          setReady(false);
        }
      }
    )
  );

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
      props.onReminderCreated?.(date);
    } else {
      toast.error('Failed to set reminder');
    }

    closeReminderPicker();
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeReminderPicker();
    }
  };

  return (
    <Show when={pickerProps() && ready()}>
      {/* Backdrop + centered anchor for the DateSelector's Combobox portal */}
      <div
        class="fixed inset-0 z-[998] flex items-center justify-center"
        onClick={handleBackdropClick}
      >
        <div class="relative">
          <DateSelector
            open={true}
            onClose={closeReminderPicker}
            onSelectDate={handleDateSelect}
            placeholder="Remind me..."
            disablePriorToDate={new Date()}
            withTime
            trigger={<div class="w-0 h-0" />}
          />
        </div>
      </div>
    </Show>
  );
};
