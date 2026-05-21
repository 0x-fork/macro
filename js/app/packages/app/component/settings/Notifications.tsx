import { useNotificationSettings } from '@notifications';
import { Button, ToggleSwitch } from '@ui';
import { Show } from 'solid-js';

/** Tab content for the Notifications section of the settings modal. */
export function Notifications() {
  const settings = useNotificationSettings();

  return (
    <div class="px-4 pb-6 flex flex-col gap-4">
      <Show
        when={settings.isSupported && settings}
        fallback={
          <Row
            label="Browser notifications"
            description="Notifications aren't supported on this device."
          >
            <span class="text-sm text-ink-muted">Not supported</span>
          </Row>
        }
      >
        {(s) => (
          <Row
            label="Browser notifications"
            description="Get notified when there's new activity while Macro isn't focused."
          >
            <Show
              when={s().isEnabled() || s().canPrompt()}
              fallback={
                <span class="text-sm text-ink-muted">Permission blocked</span>
              }
            >
              <ToggleSwitch
                checked={s().isEnabled()}
                onChange={(next) => {
                  void s().toggle(next);
                }}
              />
            </Show>
          </Row>
        )}
      </Show>

      <Row
        label="Test notification"
        description="Send a sample notification to make sure things look right."
      >
        <Button
          variant="base"
          size="sm"
          onClick={() => {
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Macro', { body: 'This is a test notification.' });
            }
          }}
        >
          Send test
        </Button>
      </Row>
    </div>
  );
}

function Row(props: {
  label: string;
  description?: string;
  children: import('solid-js').JSX.Element;
}) {
  return (
    <div class="flex items-start justify-between gap-4 py-3 border-b border-edge-muted/50 last:border-0">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-ink">{props.label}</div>
        <Show when={props.description}>
          <div class="text-xs text-ink-muted mt-0.5">{props.description}</div>
        </Show>
      </div>
      <div class="shrink-0">{props.children}</div>
    </div>
  );
}
