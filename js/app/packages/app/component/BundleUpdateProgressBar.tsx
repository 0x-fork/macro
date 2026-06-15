import { useTauri } from '@macro/tauri';
import { createMemo, Show } from 'solid-js';
import { match } from 'ts-pattern';

export function BundleUpdateProgressBar() {
  const tauri = useTauri();

  const progress = createMemo(() => {
    const s = tauri?.bundleUpdateStatus();
    if (!s) return null;
    return match(s)
      .with({ status: 'Downloading' }, (s) => s.data.progress * 0.95)
      .with({ status: 'Unzipping' }, (s) => 95 + s.data.progress * 0.05)
      .otherwise(() => null);
  });

  return (
    <Show when={progress() !== null}>
      <div class="w-full h-0.5 bg-surface-2">
        <div
          class="h-full bg-accent transition-[width] duration-200 ease-linear"
          style={{ width: `${progress() ?? 0}%` }}
        />
      </div>
    </Show>
  );
}
