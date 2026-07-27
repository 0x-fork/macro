import { LIST_VIEW_DOCS_URL } from '@app/constants/docs-links';
import { runCreateAction } from '@app/features/command/Launcher';
import { useSoupView } from '@app/features/soup/view/context';
import { useSettingsState } from '@core/constant/SettingsState';
import { useAddInboxFlow, useEmailLinksStatus } from '@core/email-link';
import EmptyStateAiGraphic from '@design/empty-state-ai.svg';
import EmptyStateCallsGraphic from '@design/empty-state-calls.svg';
import EmptyStateChannelsGraphic from '@design/empty-state-channels.svg';
import EmptyStateCompaniesGraphic from '@design/empty-state-companies.svg';
import EmptyStateDocGraphic from '@design/empty-state-doc.svg';
import EmptyStateEmailGraphic from '@design/empty-state-email.svg';
import EmptyStateFolderGraphic from '@design/empty-state-folder.svg';
import EmptyStateInboxGraphic from '@design/empty-state-inbox-tray.svg';
import EmptyStateNoSearchGraphic from '@design/empty-state-no-search-match.svg';
import EmptyStateTasksGraphic from '@design/empty-state-tasks.svg';
import PlusIcon from '@phosphor/plus.svg';
import { useCurrentTeamQuery, useIsTeamAdmin } from '@queries/team/teams';
import { EmptyStatePanel } from '@ui';
import { Match, Switch } from 'solid-js';

import {
  clearFacetRefinements,
  hasFacetRefinements,
} from './filters/facet-refinements';

export function SoupErrorState() {
  return (
    <EmptyStatePanel
      centered
      graphic={EmptyStateDocGraphic}
      title="Couldn't load this view"
      description="Try refreshing the view."
    />
  );
}

export function SoupSearchErrorState() {
  return (
    <EmptyStatePanel
      centered
      graphic={EmptyStateNoSearchGraphic}
      title="Couldn't load search results"
      description="Try searching again."
    />
  );
}

export function SoupCompaniesErrorState(props: { onRetry?: () => void }) {
  return (
    <EmptyStatePanel
      centered
      graphic={EmptyStateCompaniesGraphic}
      title="Couldn't load companies"
      description="Try refreshing the view."
      primaryAction={
        props.onRetry
          ? { label: 'Try again', onClick: props.onRetry }
          : undefined
      }
    />
  );
}

export function SoupEmptyState() {
  const { activePresetFacets, collection, view } = useSoupView();
  const teamQuery = useCurrentTeamQuery();
  const isTeamAdmin = useIsTeamAdmin();
  const { openSettings } = useSettingsState();
  const emailConnected = useEmailLinksStatus();
  const addInbox = useAddInboxFlow();
  const docsUrl = () => LIST_VIEW_DOCS_URL[view()];

  return (
    <Switch
      fallback={
        <EmptyStatePanel
          centered={view() === 'search'}
          graphic={EmptyStateInboxGraphic}
          title={view() === 'search' ? 'No items to show' : 'Inbox zero'}
          description={
            view() === 'search'
              ? 'Search across messages, documents, tasks, and more.'
              : "You're all caught up."
          }
          documentationUrl={docsUrl()}
        />
      }
    >
      <Match when={collection.state.search.trim()}>
        {(searchText) => (
          <EmptyStatePanel
            centered
            graphic={EmptyStateNoSearchGraphic}
            title={`No results for "${searchText()}"`}
            description="Try a different query or broaden your filters."
            documentationUrl={docsUrl()}
          />
        )}
      </Match>
      <Match when={hasFacetRefinements(collection, activePresetFacets())}>
        <EmptyStatePanel
          centered
          graphic={EmptyStateNoSearchGraphic}
          title="No items match these filters"
          description="Clear some filters to see more items."
          primaryAction={{
            label: 'Clear filters',
            onClick: () =>
              clearFacetRefinements(collection, activePresetFacets()),
          }}
          documentationUrl={docsUrl()}
        />
      </Match>
      <Match
        when={(view() === 'inbox' || view() === 'mail') && !emailConnected()}
      >
        <EmptyStatePanel
          graphic={
            view() === 'mail' ? EmptyStateEmailGraphic : EmptyStateInboxGraphic
          }
          title={
            view() === 'mail' ? 'Connect your email' : 'Your inbox is empty'
          }
          description="Bring your inbox into Macro to triage signal from noise and reply faster."
          primaryAction={{
            label: 'Connect email',
            onClick: () => void addInbox(),
          }}
          documentationUrl={docsUrl()}
        />
      </Match>
      <Match when={view() === 'tasks'}>
        <EmptyStatePanel
          graphic={EmptyStateTasksGraphic}
          title="Nothing to do"
          description="Tasks you create or that get assigned to you will show up here."
          primaryAction={{
            label: 'New task',
            icon: PlusIcon,
            onClick: () => runCreateAction('task'),
          }}
          documentationUrl={docsUrl()}
        />
      </Match>
      <Match when={view() === 'agents'}>
        <EmptyStatePanel
          graphic={EmptyStateAiGraphic}
          title="Get started with agents"
          description="Create an agent, or use Macro with your favorite AI client via MCP."
          primaryAction={{
            label: 'New agent',
            icon: PlusIcon,
            onClick: () => runCreateAction('chat'),
          }}
          documentationUrl={docsUrl()}
        />
      </Match>
      <Match when={view() === 'companies'}>
        <Switch>
          <Match when={teamQuery.isError}>
            <SoupCompaniesErrorState onRetry={() => void teamQuery.refetch()} />
          </Match>
          <Match when={teamQuery.data === undefined}>{null}</Match>
          <Match when={teamQuery.data === null}>
            <EmptyStatePanel
              centered
              graphic={EmptyStateCompaniesGraphic}
              title="Join a team to enable CRM"
              description="Create or join a team in Settings > Team."
              primaryAction={{
                label: 'Open team settings',
                onClick: () => openSettings('Team'),
              }}
            />
          </Match>
          <Match when={teamQuery.data?.team.crm_enabled === false}>
            <EmptyStatePanel
              centered
              graphic={EmptyStateCompaniesGraphic}
              title="CRM is disabled"
              description={
                isTeamAdmin()
                  ? 'Enable CRM in Settings > CRM to start tracking your customers.'
                  : 'Team owners and admins can enable CRM in Settings > CRM.'
              }
              primaryAction={
                isTeamAdmin()
                  ? {
                      label: 'Open CRM settings',
                      onClick: () => openSettings('CRM'),
                    }
                  : undefined
              }
            />
          </Match>
          <Match when={true}>
            <EmptyStatePanel
              graphic={EmptyStateCompaniesGraphic}
              title="No customers yet"
              description="Customers your team emails will appear here."
            />
          </Match>
        </Switch>
      </Match>
      <Match
        when={
          view() === 'folders' ||
          (view() === 'documents' && collection.state.activeTab === 'folders')
        }
      >
        <EmptyStatePanel
          graphic={EmptyStateFolderGraphic}
          title="No folders"
          description="Create a folder to organize conversations, documents, and tasks."
          primaryAction={{
            label: 'New folder',
            icon: PlusIcon,
            onClick: () => runCreateAction('project'),
          }}
          documentationUrl={docsUrl()}
        />
      </Match>
      <Match when={view() === 'documents'}>
        <EmptyStatePanel
          graphic={EmptyStateDocGraphic}
          title="No documents to show"
          primaryAction={{
            label: 'New document',
            icon: PlusIcon,
            onClick: () => runCreateAction('md'),
          }}
          documentationUrl={docsUrl()}
        />
      </Match>
      <Match when={view() === 'channels'}>
        <EmptyStatePanel
          graphic={EmptyStateChannelsGraphic}
          title="No channels to show"
          primaryAction={{
            label: 'New channel',
            icon: PlusIcon,
            onClick: () => runCreateAction('channel'),
          }}
          documentationUrl={docsUrl()}
        />
      </Match>
      <Match when={view() === 'calls'}>
        <EmptyStatePanel
          graphic={EmptyStateCallsGraphic}
          title="No calls to show"
          description="Call recordings, transcripts, and summaries will appear here."
          documentationUrl={docsUrl()}
        />
      </Match>
    </Switch>
  );
}
