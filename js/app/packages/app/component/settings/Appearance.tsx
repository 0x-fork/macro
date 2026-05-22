import { monochromeIcons, setMonochromeIcons, setTooltipsEnabled, tooltipsEnabled } from '@ui/signals/signals';
import { ThemeEditorAdvanced } from '@theme/components/ThemeEditorAdvanced';
import { ThemeEditorBasic } from '@theme/components/ThemeEditorBasic';
import ThemeTools from '@theme/components/ThemeTools';
import ThemeList from '@theme/components/ThemeList';
import { isMobile } from '@core/mobile/isMobile';
import { createSignal, onCleanup, Show } from 'solid-js';
import { TabsInset } from '@core/component/TabsInset';
import { Panel, ToggleSwitch } from '@ui';
import {
  settingsModalOpen,
  setThemePickerFloating,
} from '@core/constant/SettingsState';

type PanelA = 'basic' | 'advanced';
type PanelB ='themes' | 'ui'

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
    // Only react when the press is actually inside one of the theme controls —
    // sliders, ranges, swatches, or canvas-based pickers. Buttons / tabs / etc.
    // shouldn't dim the modal.
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

function UserInterface() {
  return (
    <div class="grid gap-px bg-edge-muted border-b border-edge-muted">
      <div class="bg-surface flex items-center justify-between h-15.25 px-6">
        <div class="text-sm">Monochrome Icons</div>
        <ToggleSwitch
          onChange={setMonochromeIcons}
          checked={monochromeIcons()}
        />
      </div>

      <div class="bg-surface flex items-center justify-between h-15.25 px-6">
        <div class="text-sm">Show Tooltips</div>
        <ToggleSwitch
          onChange={setTooltipsEnabled}
          checked={tooltipsEnabled()}
        />
      </div>

    </div>
  );
}

export function Appearance(props: { mini?: boolean } = {}) {
  const [activeTabA, setActiveTabA] = createSignal<PanelA>('basic');
  const [activeTabB, setActiveTabB] = createSignal<PanelB>('themes');
  const dragHandlers = useThemePickerDragHandlers();

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
      class="h-full overflow-hidden flex p-2"
      onPointerDown={dragHandlers.onPointerDown}
    >
      <div
        class="size-full"
        style={{
          'grid-template-rows': `${isMobile() ? '322.5px' : '432.5px'} 1fr`,
          'grid-template-columns': '1fr',
          'overflow': 'hidden',
          'display': 'grid',
          'gap': '8px',
        }}
      >
        <Panel depth={2}>
          <Panel.Header>
            <TabsInset
              onChange={(value) => setActiveTabA(value as PanelA)}
              list={[
                { value: 'basic', label: 'Basic' },
                { value: 'advanced', label: 'Advanced' },
              ]}
              value={activeTabA()}
              defaultValue="basic"
            />
            <Show when={!isMobile()}>
              <ThemeTools class="flex-1 min-w-0" />
            </Show>
          </Panel.Header>

          <Show when={isMobile()}>
            <Panel.Toolbar>
              <ThemeTools class="flex-1 min-w-0" />
            </Panel.Toolbar>
          </Show>

          <Panel.Body scroll>
            <Show when={activeTabA() === 'basic'}>
              <ThemeEditorBasic />
            </Show>
            <Show when={activeTabA() === 'advanced'}>
              <ThemeEditorAdvanced />
            </Show>
          </Panel.Body>
        </Panel>

        <Panel depth={2}>
          <Panel.Header>
            <TabsInset
            onChange={(value) => setActiveTabB(value as PanelB)}
              list={[
                { value: 'themes', label: 'Themes' },
                { value: 'ui', label: 'UI' },
              ]}
              value={activeTabB()}
              defaultValue="list"
            />
          </Panel.Header>
          <Panel.Body scroll>
            <Show when={activeTabB() === 'themes'}>
              <ThemeList />
            </Show>
            <Show when={activeTabB() === 'ui'}>
              <UserInterface />
            </Show>
          </Panel.Body>
        </Panel>
      </div>
    </div>
  );
}
