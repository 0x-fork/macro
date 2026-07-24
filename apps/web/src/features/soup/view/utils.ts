import type { ListView } from '@app/constants/list-views';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import {
  ENABLE_NEW_INBOX_FLAG,
  ENABLE_NEW_INBOX_OVERRIDE,
} from '@core/constant/featureFlags';
import { type Accessor, createMemo } from 'solid-js';
import { useMaybeSoupView } from './context';

export function showSoupSort(view: ListView, isNewInbox: boolean) {
  return (
    view !== 'search' &&
    view !== 'companies' &&
    view !== 'calls' &&
    !(view === 'inbox' && isNewInbox)
  );
}

/** Resolves New Inbox policy from the mounted view and feature flag. */
export function useIsNewInbox(options?: {
  view?: Accessor<ListView>;
  override?: Accessor<boolean | undefined>;
}) {
  const context = useMaybeSoupView();
  const view = options?.view ?? context?.view;
  const override = options?.override ?? context?.newInboxOverride;
  const flag = useFeatureFlag(ENABLE_NEW_INBOX_FLAG, {
    enabledOverride: ENABLE_NEW_INBOX_OVERRIDE,
  });

  if (!view) {
    throw new Error(
      'useIsNewInbox requires SoupViewProvider or an explicit view accessor'
    );
  }

  return createMemo(
    () => view() === 'inbox' && (override?.() ?? flag().enabled)
  );
}
