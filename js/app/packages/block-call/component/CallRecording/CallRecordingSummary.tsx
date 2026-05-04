import Notepad from '@phosphor-icons/core/assets/regular/notepad.svg';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { channelTheme } from '@core/component/LexicalMarkdown/theme';
import type { CallRecord } from '@service-storage/generated/schemas/callRecord';
import type { Accessor } from 'solid-js';
import { Show, createMemo, createSignal } from 'solid-js';
import { CallRecordingSectionShell } from './CallRecordingSectionShell';

export function CallRecordingSummarySection(props: {
  record: Accessor<CallRecord>;
}) {
  const summary = createMemo(() => {
    const value = props.record().summary;
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });
  const [open, setOpen] = createSignal(true);

  return (
    <Show when={summary()}>
      {(text) => (
        <CallRecordingSectionShell
          title="Summary"
          icon={<Notepad class="size-4 text-ink shrink-0" />}
          accordion
          accordionOpenMaxVh={45}
          open={open()}
          onToggle={() => setOpen((v) => !v)}
        >
          <div class="min-h-0 flex-1 overflow-y-auto scrollbar-hidden px-4 py-3 text-sm text-ink">
            <StaticMarkdown
              markdown={text()}
              theme={channelTheme}
              target="internal"
            />
          </div>
        </CallRecordingSectionShell>
      )}
    </Show>
  );
}
