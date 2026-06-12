import { createControlledOpenSignal } from '@core/util/createControlledOpenSignal';

/**
 * Open/close signal for the automation composer modal. Flip to `true` from
 * anywhere (e.g. launcher / unified-list create button) to pop the dialog.
 *
 * Lives apart from AutomationComposer.tsx so openers (launcher etc.) don't
 * statically pull the composer UI (and the markdown editor stack behind it)
 * into the initial bundle — Layout lazy-loads the component when this flips.
 */
export const [automationComposerOpen, setAutomationComposerOpen] =
  createControlledOpenSignal(false, { id: 'automation-composer' });
