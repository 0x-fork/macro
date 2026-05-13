import { useSplitLayout } from '@app/component/split-layout/layout';
import { AttachmentEntityRow } from '@channel/Attachments/AttachmentEntityRow';
import { getEntityClickContent } from '@channel/Attachments/attachment-utils';
import {
  AttachmentSection,
  LoadMoreButton,
} from '@channel/Attachments/SectionHeader';
import { DocumentRowSkeleton } from '@channel/Attachments/Skeletons';
import type { EntityData } from '@entity';
import { useSoupAstItemsQuery } from '@queries/soup/items';
import { createMemo, For, Show } from 'solid-js';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const SKELETON_ROW_COUNT = 6;

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

type ContactEmailsSectionProps = {
  email: string;
  /** Override the section heading (default "Emails"). */
  label?: string;
  /** When true, expand the AST with the `TeamScope` literal so the soup
   * service returns emails from any teammate's mailbox involving this
   * contact, not just the requesting user's mailbox. */
  teamScope?: boolean;
  /** Override the empty-state message. */
  emptyMessage?: string;
  /** When true, render nothing if the query errors. Used for the
   * team-scoped variant: the backend rejects the request when the
   * contact's domain isn't a CRM company with email_sync enabled, and
   * we'd rather hide the section than show a broken state. */
  hideOnError?: boolean;
};

export function ContactEmailsSection(props: ContactEmailsSectionProps) {
  const teamScope = () => props.teamScope ?? false;

  const query = useSoupAstItemsQuery(
    () => ({
      params: { limit: 6, sort_method: 'updated_at' },
      body: {
        df: { l: { id: NIL_UUID } },
        ef: buildEmailInvolvementAst(props.email, teamScope()),
        chanf: { l: { ChannelId: NIL_UUID } },
        cf: { l: { cid: NIL_UUID } },
        pf: { l: { pid: NIL_UUID } },
        callf: { l: { CallId: NIL_UUID } },
        emailView: 'all',
      },
    }),
    // When the team-scoped variant is rejected (e.g. the contact's domain
    // isn't an email-sync-enabled CRM company), we hide the section via
    // `hideOnError` — don't retry, so the section disappears immediately
    // instead of after three failed attempts.
    () => ({ retry: !props.hideOnError }),
  );

  const { replaceOrInsertSplit } = useSplitLayout();

  const entities = createMemo<EntityData[]>(() => query.data ?? []);

  const handleEntityClick = (entity: EntityData) =>
    replaceOrInsertSplit(getEntityClickContent(entity));

  const hidden = () => !!props.hideOnError && query.isError;

  return (
    <Show when={!hidden()}>
      <AttachmentSection
        label={props.label ?? 'Emails'}
        class="flex flex-1 min-h-0 flex-col md:flex-none"
        contentClass="flex flex-1 min-h-0 flex-col"
      >
        <Show
          when={!query.isLoading}
          fallback={
            <For each={Array.from({ length: SKELETON_ROW_COUNT })}>
              {() => <DocumentRowSkeleton />}
            </For>
          }
        >
          <Show
            when={entities().length > 0}
            fallback={
              <div class="py-3 text-sm text-ink-faint">
                {props.emptyMessage ?? 'No emails involving this contact.'}
              </div>
            }
          >
            <div class="min-h-0 h-full overflow-y-auto md:h-105">
              <For each={entities()}>
                {(entity) => (
                  <AttachmentEntityRow
                    entity={entity}
                    onClick={() => handleEntityClick(entity)}
                  />
                )}
              </For>
              <Show when={query.hasNextPage}>
                <LoadMoreButton
                  onLoadMore={() => query.fetchNextPage()}
                  isFetching={() => query.isFetchingNextPage}
                />
              </Show>
            </div>
          </Show>
        </Show>
      </AttachmentSection>
    </Show>
  );
}
