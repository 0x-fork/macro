import { semanticV2, setSemanticV2 } from '@theme/signals/themeSignals';

import {
  clearAllDebugSettings,
  DEBUG_SETTINGS,
  type DebugSettingDef,
  debugSettings,
  getDebugSetting,
  setDebugSetting,
} from '@app/lib/debugSettings';
import { Button, ToggleSwitch } from '@ui';
import { For } from 'solid-js';
import { SettingsCard, SettingsPage, SettingsRow } from './primitives';

function DebugSettingRow(props: { setting: DebugSettingDef }) {
  const checked = () => getDebugSetting(props.setting.key);

  return (
    <SettingsRow
      label={props.setting.label}
      description={props.setting.description}
    >
      <ToggleSwitch
        size="md"
        checked={checked()}
        onChange={(value) => setDebugSetting(props.setting.key, value)}
      />
    </SettingsRow>
  );
}

/** Toggles the `semantic-v2` design-token migration on <html> (see index.css
 *  and Root.tsx). Mirrors into the semanticV2 signal so Surface/Layer react too. */
function NewTokensRow() {
  const toggle = (on: boolean) => {
    document.documentElement.classList.toggle('semantic-v2', on);
    setSemanticV2(on);
  };

  return (
    <SettingsRow
      label="New semantic tokens"
      description="Switch surfaces, borders, and controls to the new semantic-v2 design tokens."
    >
      <ToggleSwitch size="md" checked={semanticV2()} onChange={toggle} />
    </SettingsRow>
  );
}

export function Admin() {
  const hasActiveSettings = () => Object.keys(debugSettings()).length > 0;

  return (
    <SettingsPage
      title="Debug"
      description="Local toggles for debugging — only visible to Macro staff."
      actions={
        <Button
          variant="base"
          size="sm"
          depth={3}
          disabled={!hasActiveSettings()}
          onClick={clearAllDebugSettings}
        >
          Reset all
        </Button>
      }
    >
      <SettingsCard>
        <NewTokensRow />
      </SettingsCard>
      <SettingsCard>
        <For each={DEBUG_SETTINGS}>
          {(setting) => <DebugSettingRow setting={setting} />}
        </For>
      </SettingsCard>
    </SettingsPage>
  );
}
