import { useSplitLayout } from '@app/component/split-layout/layout';
import { AttachmentEntityRow } from '@channel/Attachments/AttachmentEntityRow';
import { getEntityClickContent } from '@channel/Attachments/attachment-utils';
import { LoadMoreButton } from '@channel/Attachments/SectionHeader';
import { DocumentRowSkeleton } from '@channel/Attachments/Skeletons';
import type { EntityData } from '@entity';
import { type TabItem, Tabs } from '@core/component/Tabs';
import { useSoupAstItemsQuery } from '@queries/soup/items';
import { useUserTeamsQuery } from '@queries/team';
import { Panel } from '@ui';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  Show,
} from 'solid-js';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const SKELETON_ROW_COUNT = 6;

type EmailTabId = 'mine' | 'team';

function buildEmailInvolvementAst(email: string, teamScope: boolean) {
  const participantClause = {
    '|': [
      {
        '|': [
          {
            '|': [
              { l: { Sender: { Complete: email } } },
              { l: { Cc: { Complete: email } } },
            ],
          },
          { l: { Bcc: { Complete: email } } },
        ],
      },
      { l: { Recipient: { Complete: email } } },
    ],
  };
  const sharedClause = { l: { Shared: 'exclude' } };
  const teamScopeClause = { l: 'TeamScope' as const };

  const rightSide = teamScope
    ? { '&': [sharedClause, teamScopeClause] }
    : sharedClause;

  return { '&': [participantClause, rightSide] };
}

function useContactEmailsQuery(email: () => string, options: {
  teamScope: boolean;
  enabled?: () => boolean;
}) {
  return useSoupAstItemsQuery(
    () => ({
      params: { limit: 6, sort_method: 'updated_at' },
      body: {
        df: { l: { id: NIL_UUID } },
        ef: buildEmailInvolvementAst(email(), options.teamScope),
        chanf: { l: { ChannelId: NIL_UUID } },
        cf: { l: { cid: NIL_UUID } },
        pf: { l: { pid: NIL_UUID } },
        callf: { l: { CallId: NIL_UUID } },
        emailView: 'all',
      },
    }),
    () => ({
      enabled: options.enabled?.() ?? true,
      // team_scope is rejected by the backend when the contact's domain
      // isn't a CRM company with email_sync=true. Fail fast so we can hide
      // the team tab immediately instead of cycling through default retries.
      retry: !options.teamScope,
    }),
  );
}

export function ContactEmailsSection(props: { email: string }) {
  const userTeamsQuery = useUserTeamsQuery();
  const onTeam = () => (userTeamsQuery.data?.length ?? 0) > 0;

  const mineQuery = useContactEmailsQuery(() => props.email, {
    teamScope: false,
  });
  const teamQuery = useContactEmailsQuery(() => props.email, {
    teamScope: true,
    enabled: onTeam,
  });

  const teamAvailable = () => onTeam() && !teamQuery.isError;

  const [activeTab, setActiveTab] = createSignal<EmailTabId>('mine');

  // If the team query was the active tab and later errors, drop back to
  // Mine so the user isn't stuck on a hidden tab.
  createEffect(() => {
    if (activeTab() === 'team' && !teamAvailable()) {
      setActiveTab('mine');
    }
  });

  const tabs = (): TabItem[] | undefined =>
    teamAvailable()
      ? [
          { value: 'mine', label: 'Mine' },
          { value: 'team', label: 'Team' },
        ]
      : undefined;

  const activeQuery = () =>
    activeTab() === 'team' ? teamQuery : mineQuery;

  const { replaceOrInsertSplit } = useSplitLayout();

  const entities = createMemo<EntityData[]>(() => activeQuery().data ?? []);

  const handleEntityClick = (entity: EntityData) =>
    replaceOrInsertSplit(getEntityClickContent(entity));

  return (
    <Panel depth={2} class="h-auto">
      <Panel.Header class="justify-between">
        <Show
          when={tabs()}
          fallback={<h3 class="text-sm font-medium text-ink">Emails</h3>}
        >
          {(t) => (
            <Tabs
              list={t()}
              value={activeTab()}
              onChange={(v) => setActiveTab(v as EmailTabId)}
            />
          )}
        </Show>
      </Panel.Header>
      <Panel.Body class="p-3">
        <EmailsList
          query={activeQuery()}
          entities={entities()}
          onEntityClick={handleEntityClick}
        />
      </Panel.Body>
    </Panel>
  );
}

type ListQuery = {
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
};

function EmailsList(props: {
  query: ListQuery;
  entities: EntityData[];
  onEntityClick: (entity: EntityData) => void;
}): JSX.Element {
  return (
    <Show
      when={!props.query.isLoading}
      fallback={
        <For each={Array.from({ length: SKELETON_ROW_COUNT })}>
          {() => <DocumentRowSkeleton />}
        </For>
      }
    >
      <Show
        when={props.entities.length > 0}
        fallback={
          <div class="py-3 text-sm text-ink-faint">
            No emails involving this contact.
          </div>
        }
      >
        <div class="min-h-0 h-full overflow-y-auto md:h-105">
          <For each={props.entities}>
            {(entity) => (
              <AttachmentEntityRow
                entity={entity}
                onClick={() => props.onEntityClick(entity)}
              />
            )}
          </For>
          <Show when={props.query.hasNextPage}>
            <LoadMoreButton
              onLoadMore={() => props.query.fetchNextPage()}
              isFetching={() => props.query.isFetchingNextPage}
            />
          </Show>
        </div>
      </Show>
    </Show>
  );
}
