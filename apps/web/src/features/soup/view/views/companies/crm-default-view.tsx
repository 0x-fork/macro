import {
  usePersonalCrmViews,
  useTeamCrmViews,
} from '@companies/crm/saved-views';
import { createEffect } from 'solid-js';
import { useApplyCompanyView } from './use-apply-company-view';

/** Apply a fresh entry's personal default, falling back to the team default. */
export function CrmDefaultViewLoader() {
  const personal = usePersonalCrmViews();
  const team = useTeamCrmViews();
  const applyView = useApplyCompanyView();

  let applied = false;
  createEffect(() => {
    if (applied || personal.isLoading() || team.isLoading()) return;
    applied = true;
    const personalConfig = personal.defaultView()?.config;
    if (personalConfig && applyView(personalConfig)) return;
    const teamConfig = team.defaultView()?.config;
    if (teamConfig) applyView(teamConfig);
  });

  return null;
}
