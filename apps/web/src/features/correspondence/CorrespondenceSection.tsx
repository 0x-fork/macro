import { openEntityInSplitFromUnifiedList } from '@app/features/next-soup/utils';
import { SidePanel } from '@components/app/side-panel';
import { useSplitLayout } from '@components/app/split-layout/layout';
import {
  ListEntity,
  ListEntityMetadataQueryProvider,
  ListLayoutProvider,
} from '@entity';
import {
  createMemo,
  createSignal,
  For,
  type JSX,
  type ParentProps,
  Show,
  Suspense,
} from 'solid-js';
import { type CorrespondenceParty, partyDomains } from './parties';
import {
  CORRESPONDENCE_THREAD_LIMIT,
  useCorrespondenceThreadsQuery,
} from './use-correspondence-threads';
import {
  useCrmCompanyForDomain,
  useCrmContactForAddress,
} from './use-crm-records';

/**
 * The "Correspondence" side-panel section: who the external parties on the
 * current email thread / calendar event are, the company they belong to, and
 * the recent email history with them.
 *
 * Renders nothing when `parties` is empty, which is how the "external parties
 * only" rule is enforced — callers pass the output of
 * {@link import('./parties').externalParties}.
 */
export function CorrespondenceSidePanelSection(props: {
  parties: CorrespondenceParty[];
  /** Render order within the panel — lower numbers appear first. */
  order?: number;
}) {
  return (
    <Show when={props.parties.length > 0}>
      <SidePanel.Section
        id="correspondence"
        title="Correspondence"
        order={props.order}
        defaultOpen
      >
        <CorrespondenceContent parties={props.parties} />
      </SidePanel.Section>
    </Show>
  );
}

function CorrespondenceContent(props: { parties: CorrespondenceParty[] }) {
  const domains = createMemo(() => partyDomains(props.parties));
  const addresses = createMemo(() => props.parties.map((p) => p.email));

  return (
    <div class="flex flex-col gap-3 py-1">
      <Block label={props.parties.length === 1 ? 'Contact' : 'Contacts'}>
        <For each={props.parties}>
          {(party) => <ContactRow party={party} />}
        </For>
      </Block>

      <Block label={domains().length === 1 ? 'Company' : 'Companies'}>
        <For each={domains()}>{(domain) => <CompanyRow domain={domain} />}</For>
      </Block>

      <Block label="Recent emails">
        <RecentThreads addresses={addresses()} />
      </Block>
    </div>
  );
}

function Block(props: ParentProps<{ label: JSX.Element }>) {
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <div class="px-1 text-[0.6875rem] uppercase tracking-wide text-ink-extra-muted">
        {props.label}
      </div>
      {props.children}
    </div>
  );
}

/**
 * One external party. Opens their CRM contact record when the team tracks
 * one; otherwise it is a plain, inert row showing what the thread/event knows
 * about them.
 */
function ContactRow(props: { party: CorrespondenceParty }) {
  const { replaceOrInsertSplit } = useSplitLayout();
  const { contact } = useCrmContactForAddress(() => props.party.email);

  const label = () => contact()?.name ?? props.party.name ?? props.party.email;

  return (
    <button
      type="button"
      disabled={!contact()}
      onClick={() => {
        const id = contact()?.id;
        if (id) replaceOrInsertSplit({ type: 'contact', id });
      }}
      class="flex min-w-0 flex-col gap-0.5 rounded-md px-1 py-0.5 text-left"
      classList={{
        'hover:bg-ink-muted/[0.06]': !!contact(),
        'cursor-default': !contact(),
      }}
    >
      <span class="truncate text-xs text-ink">{label()}</span>
      <Show when={label() !== props.party.email}>
        <span class="truncate text-[0.6875rem] text-ink-extra-muted">
          {props.party.email}
        </span>
      </Show>
    </button>
  );
}

/**
 * The CRM company behind an external domain. Falls back to the bare domain
 * once the lookup settles without a match — the team simply doesn't track a
 * company for it yet.
 */
function CompanyRow(props: { domain: string }) {
  const { replaceOrInsertSplit } = useSplitLayout();
  const { company, isLoading } = useCrmCompanyForDomain(() => props.domain);

  return (
    <Show
      when={company()}
      fallback={
        <Show when={!isLoading()} fallback={<SidePanel.Loading />}>
          <div class="px-1 py-0.5 text-xs text-ink-muted">{props.domain}</div>
        </Show>
      }
    >
      {(record) => (
        <button
          type="button"
          onClick={() =>
            replaceOrInsertSplit({ type: 'company', id: record().id })
          }
          class="flex min-w-0 flex-col gap-0.5 rounded-md px-1 py-0.5 text-left hover:bg-ink-muted/[0.06]"
        >
          <span class="truncate text-xs text-ink">
            {record().name || props.domain}
          </span>
          <Show when={record().name && record().name !== props.domain}>
            <span class="truncate text-[0.6875rem] text-ink-extra-muted">
              {props.domain}
            </span>
          </Show>
        </button>
      )}
    </Show>
  );
}

/**
 * The most recent shared email threads, capped at
 * {@link CORRESPONDENCE_THREAD_LIMIT} and scrolled inside a fixed-height box
 * so a chatty correspondent can't stretch the panel.
 */
function RecentThreads(props: { addresses: string[] }) {
  const threadsQuery = useCorrespondenceThreadsQuery(() => props.addresses);
  const threads = createMemo(() =>
    (threadsQuery.data?.entities ?? []).slice(0, CORRESPONDENCE_THREAD_LIMIT)
  );

  const [listRef, setListRef] = createSignal<HTMLElement>();

  return (
    <Suspense fallback={<SidePanel.Loading />}>
      <Show when={!threadsQuery.isLoading} fallback={<SidePanel.Loading />}>
        <Show
          when={threads().length > 0}
          fallback={
            <div class="px-1 py-0.5 text-xs text-ink-muted">
              No emails with these contacts yet.
            </div>
          }
        >
          <div class="max-h-64 overflow-y-auto text-xs">
            <ListEntityMetadataQueryProvider>
              <ListLayoutProvider ref={listRef}>
                <div ref={setListRef} class="flex flex-col">
                  <For each={threads()}>
                    {(entity) => (
                      <ListEntity
                        entity={entity}
                        timestamp={entity.updatedAt}
                        onClick={() =>
                          openEntityInSplitFromUnifiedList(entity, {})
                        }
                      />
                    )}
                  </For>
                </div>
              </ListLayoutProvider>
            </ListEntityMetadataQueryProvider>
          </div>
        </Show>
      </Show>
    </Suspense>
  );
}
