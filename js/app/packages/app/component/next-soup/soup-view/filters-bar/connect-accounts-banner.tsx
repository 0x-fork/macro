import { openAddInboxDialog } from '@app/component/AddInboxDialog';
import { useHasPaidAccess } from '@core/auth';
import { PaywallKey, usePaywallState } from '@core/constant/PaywallState';
import { useSettingsState } from '@core/constant/SettingsState';
import PlusIcon from '@phosphor/plus.svg';
import { useEmailLinksQuery } from '@queries/email/link';
import { Button } from '@ui';
import { Show } from 'solid-js';

/**
 * Small banner in the mail header inviting the user to connect additional
 * email accounts. Shown once the first inbox is connected and hidden when
 * the user already has multiple. Multi-inbox is a team feature: free users
 * get the paywall instead of the add-inbox flow (also enforced centrally in
 * `AddInboxDialog`).
 */
export function ConnectAccountsBanner() {
  const linksQuery = useEmailLinksQuery();
  const hasPaidAccess = useHasPaidAccess();
  const paywall = usePaywallState();
  const { openSettings } = useSettingsState();

  const onClick = () => {
    if (!hasPaidAccess()) {
      paywall.showPaywall(PaywallKey.MULTI_INBOX);
      return;
    }
    openSettings('Account');
    openAddInboxDialog();
  };

  return (
    <Show when={(linksQuery.data?.links ?? []).length === 1}>
      <Button
        variant="base"
        size="sm"
        depth={2}
        class="bg-surface gap-1 shrink-0"
        onClick={onClick}
      >
        <PlusIcon class="size-3.5 text-accent" />
        <span class="text-accent">Connect multiple accounts</span>
      </Button>
    </Show>
  );
}
