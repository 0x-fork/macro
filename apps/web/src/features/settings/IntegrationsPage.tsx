import { ENABLE_EMAIL } from '@core/constant/featureFlags';
import { useSettingsState } from '@core/constant/SettingsState';
import { useSettingsTabAvailable } from '@core/constant/settingsTabsConfig';
import { usePipedreamMcpFlag } from '@core/pipedream/flag';
import { createSignal, Show, Suspense } from 'solid-js';
import { IntegrationsView } from './connections/integrations-view';
import { EmailCard } from './Email';
import { GitHubCard } from './GitHub';
import { GranolaCard } from './Granola';
import { Harness } from './Harness';
import { IntegrationsSection } from './Integrations';
import { SettingsPage } from './primitives';

/** Personal accounts and agent tools share one Integrations settings page. */
export function IntegrationsPage() {
  const pipedreamMcp = usePipedreamMcpFlag();
  const isTabAvailable = useSettingsTabAvailable();
  const { openSettings } = useSettingsState();
  const [showLocalAgents, setShowLocalAgents] = createSignal(false);
  return (
    <Show
      when={pipedreamMcp()}
      fallback={
        <SettingsPage title="Integrations">
          <AccountConnections />
          <Suspense>
            <IntegrationsSection />
          </Suspense>
        </SettingsPage>
      }
    >
      <Show
        when={showLocalAgents() && isTabAvailable('Harness')}
        fallback={
          <IntegrationsView
            onOpenMacroMcp={() => openSettings('Agent')}
            onOpenLocalAgents={
              isTabAvailable('Harness')
                ? () => setShowLocalAgents(true)
                : undefined
            }
          >
            <AccountConnections />
          </IntegrationsView>
        }
      >
        <Harness
          onBack={() => setShowLocalAgents(false)}
          backLabel="Integrations"
        />
      </Show>
    </Show>
  );
}

function AccountConnections() {
  const { openSettings } = useSettingsState();
  return (
    <section
      data-settings-target="accounts"
      tabIndex={-1}
      class="pb-5 outline-none"
    >
      <h2 class="mb-4 text-lg font-medium text-ink">Core Integrations</h2>
      <div class="grid grid-cols-1 items-stretch gap-3 @[760px]/settings-page:auto-rows-fr @[760px]/settings-page:grid-cols-2">
        <Show when={ENABLE_EMAIL}>
          <Suspense>
            <EmailCard
              class="h-full bg-ink/4 shadow-none light-mode:shadow-none touch:bg-ink/4"
              onOpenSettings={() => openSettings('Email')}
            />
          </Suspense>
        </Show>
        <Suspense>
          <GitHubCard class="h-full bg-ink/4 shadow-none light-mode:shadow-none touch:bg-ink/4" />
        </Suspense>
        <Suspense>
          <GranolaCard />
        </Suspense>
      </div>
    </section>
  );
}
