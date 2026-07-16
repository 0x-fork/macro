/**
 * Documentation settings tab: team admins enable or disable the
 * Documentation feature here. Enabling requires the team to be on a team
 * plan (enforced server-side); disabling never unpublishes existing sites.
 */

import { toast } from '@core/component/Toast/Toast';
import { SERVER_HOSTS } from '@core/constant/servers';
import { throwOnErr } from '@core/util/result';
import SpinnerIcon from '@phosphor/spinner.svg';
import { invalidateDocumentationAvailability } from '@queries/documentation/sites';
import {
  invalidateUserTeams,
  useCurrentTeamQuery,
  useIsTeamAdmin,
} from '@queries/team/teams';
import { fetchWithAuth } from '@service-auth/fetch';
import type { PatchTeamDocumentationSettingsRequest } from '@service-auth/generated/schemas/patchTeamDocumentationSettingsRequest';
import type { PatchTeamDocumentationSettingsResponse } from '@service-auth/generated/schemas/patchTeamDocumentationSettingsResponse';
import { useMutation } from '@tanstack/solid-query';
import { Button, Tooltip } from '@ui';
import { Show, Suspense } from 'solid-js';
import {
  SettingsCard,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from './primitives';

const authHost = SERVER_HOSTS['auth-service'];

/**
 * PATCH /team/documentation on the auth service. Same shape as the CRM
 * settings mutation: the generated orval client issues a bare relative
 * `fetch` with no auth, so we go through `fetchWithAuth`.
 */
function usePatchTeamDocumentationSettingsMutation() {
  return useMutation(() => ({
    mutationFn: async (req: PatchTeamDocumentationSettingsRequest) =>
      await throwOnErr(() =>
        fetchWithAuth<PatchTeamDocumentationSettingsResponse>(
          `${authHost}/team/documentation`,
          {
            method: 'PATCH',
            body: JSON.stringify(req),
          }
        )
      ),
    onSuccess: (data: PatchTeamDocumentationSettingsResponse) => {
      invalidateUserTeams();
      invalidateDocumentationAvailability();
      toast.success(
        data.enabled ? 'Documentation enabled' : 'Documentation disabled'
      );
    },
    onError: (error: Error) => {
      console.error('Failed to update Documentation settings', error);
      // The server rejects enabling without a team plan with a 403.
      toast.failure(
        error.message.includes('403')
          ? 'Documentation requires a team plan'
          : 'Failed to update Documentation settings'
      );
    },
  }));
}

function DocumentationEnablementSection() {
  const isTeamAdmin = useIsTeamAdmin();
  const teamQuery = useCurrentTeamQuery();
  const patchMutation = usePatchTeamDocumentationSettingsMutation();

  // The mutation invalidates the team query on success, which refetches
  // the authoritative flag.
  const documentationEnabled = () =>
    teamQuery.data?.team.documentation_enabled ?? false;

  const handleToggle = () => {
    if (!isTeamAdmin() || patchMutation.isPending) return;
    patchMutation.mutate({ enabled: !documentationEnabled() });
  };

  return (
    <SettingsSection title="General">
      <SettingsCard>
        <SettingsRow
          label={
            documentationEnabled()
              ? 'Disable Documentation'
              : 'Enable Documentation'
          }
          description={
            documentationEnabled()
              ? 'Turning Documentation off hides the tab for your team. Published sites stay up until they are deleted.'
              : 'Let your team build and publish documentation sites from Macro documents. Requires a team plan.'
          }
          hideDescriptionOnMobile
        >
          <Show
            when={isTeamAdmin()}
            fallback={
              <Tooltip label="Only team admins can change Documentation settings.">
                <span>
                  <Button variant="base" size="sm" class="rounded-xs" disabled>
                    Admins only
                  </Button>
                </span>
              </Tooltip>
            }
          >
            <div class="flex items-center gap-2">
              <Show when={patchMutation.isPending}>
                <SpinnerIcon class="size-4 animate-spin text-ink-muted" />
              </Show>
              <Button
                variant={documentationEnabled() ? 'danger' : 'active'}
                size="sm"
                class="rounded-xs"
                disabled={patchMutation.isPending}
                onClick={handleToggle}
              >
                {documentationEnabled() ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </Show>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  );
}

function NoTeamState() {
  return (
    <SettingsPage title="Documentation">
      <SettingsSection>
        <SettingsCard>
          <div class="px-6 py-8 text-center text-sm text-ink-muted">
            Join or create a team to set up Documentation.
          </div>
        </SettingsCard>
      </SettingsSection>
    </SettingsPage>
  );
}

function DocumentationContent() {
  const teamQuery = useCurrentTeamQuery();

  return (
    <Show when={teamQuery.data} fallback={<NoTeamState />}>
      <SettingsPage
        title="Documentation"
        description="Enable or disable documentation sites for your team."
      >
        <DocumentationEnablementSection />
      </SettingsPage>
    </Show>
  );
}

export function Documentation() {
  return (
    <Suspense
      fallback={
        <div class="animate-pulse bg-ink-extra-muted rounded h-4 w-32 m-6" />
      }
    >
      <DocumentationContent />
    </Suspense>
  );
}
