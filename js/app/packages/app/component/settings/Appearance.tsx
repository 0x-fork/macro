import {
  monochromeIcons,
  setMonochromeIcons,
  setTooltipsEnabled,
  tooltipsEnabled,
} from '@ui/signals/signals';
import { ThemeEditorAdvanced } from '@theme/components/ThemeEditorAdvanced';
import { ThemeEditorBasic } from '@theme/components/ThemeEditorBasic';
import ThemeTools from '@theme/components/ThemeTools';
import ThemeList from '@theme/components/ThemeList';
import { createSignal, type JSX, onCleanup, Show } from 'solid-js';
import { Panel, ToggleSwitch } from '@ui';
import CaretRight from '@phosphor/caret-right.svg';
import {
  settingsModalOpen,
  setThemePickerFloating,
} from '@core/constant/SettingsState';

/**
 * Listens for pointerdown on the theme editor area to enter the "floating preview"
 * mode where the settings modal becomes transparent and a mini picker mirrors
 * the user's input from the bottom-right. The mode releases on the next pointerup
 * anywhere on the document.
 */
function useThemePickerDragHandlers() {
  let endListener: (() => void) | undefined;

  const onPointerDown = (e: PointerEvent) => {
    if (!settingsModalOpen()) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const isThemeControl =
      target.closest(
        'input[type="range"], canvas, [data-theme-color-control], .theme-editor-basic-slider'
      ) !== null;
    if (!isThemeControl) return;
    setThemePickerFloating(true);
    if (endListener) return;
    const end = () => {
      setThemePickerFloating(false);
      if (endListener) {
        document.removeEventListener('pointerup', endListener, true);
        document.removeEventListener('pointercancel', endListener, true);
        endListener = undefined;
      }
    };
    endListener = end;
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
  };

  onCleanup(() => {
    if (endListener) {
      document.removeEventListener('pointerup', endListener, true);
      document.removeEventListener('pointercancel', endListener, true);
      endListener = undefined;
    }
    setThemePickerFloating(false);
  });

  return { onPointerDown };
}

function Section(props: {
  title: string;
  right?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <div class="flex flex-col gap-3">
      <div class="flex min-h-7 items-center justify-between gap-3">
        <h3 class="text-sm font-semibold text-ink">{props.title}</h3>
        <Show when={props.right}>{props.right}</Show>
      </div>
      <div>{props.children}</div>
    </div>
  );
}

function ToggleRow(props: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div class="flex min-h-10 items-center justify-between gap-4 py-1.5">
      <div class="flex min-w-0 flex-col gap-0.5">
        <div class="text-sm">{props.label}</div>
        <Show when={props.description}>
          <div class="text-xs text-ink-extra-muted">{props.description}</div>
        </Show>
      </div>
      <ToggleSwitch onChange={props.onChange} checked={props.checked} />
    </div>
  );
}

function UserInterface() {
  return (
    <div class="flex flex-col gap-3">
      <ToggleRow
        label="Monochrome icons"
        description="Render entity icons in a single tone"
        checked={monochromeIcons()}
        onChange={setMonochromeIcons}
      />
      <ToggleRow
        label="Show tooltips"
        description="Show hover tooltips throughout the app"
        checked={tooltipsEnabled()}
        onChange={setTooltipsEnabled}
      />
    </div>
  );
}

export function Appearance(props: { mini?: boolean } = {}) {
  const dragHandlers = useThemePickerDragHandlers();
  const [showAdvanced, setShowAdvanced] = createSignal(false);

  if (props.mini) {
    return (
      <div class="size-full overflow-hidden p-2">
        <Panel depth={2} class="size-full">
          <Panel.Body scroll>
            <ThemeEditorBasic />
          </Panel.Body>
        </Panel>
      </div>
    );
  }

  return (
    <div
      class="flex w-full flex-col divide-y divide-edge-muted text-ink"
      onPointerDown={dragHandlers.onPointerDown}
    >
      <div class="pb-6">
        <Section title="Interface">
          <UserInterface />
        </Section>
      </div>

      <div class="py-6">
        <Section title="Colors" right={<ThemeTools />}>
          <div class="flex flex-col gap-4">
            <ThemeEditorBasic />
            <div class="flex flex-col gap-3">
              <button
                type="button"
                class="flex items-center gap-1 self-start text-xs text-ink-muted hover:text-ink"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                <CaretRight
                  class={`size-3 transition-transform ${
                    showAdvanced() ? 'rotate-90' : ''
                  }`}
                />
                Advanced colors
              </button>
              <Show when={showAdvanced()}>
                <ThemeEditorAdvanced />
              </Show>
            </div>
          </div>
        </Section>
      </div>

      <div class="py-6">
        <Section title="Theme presets">
          <ThemeList />
        </Section>
      </div>
    </div>
  );
}
