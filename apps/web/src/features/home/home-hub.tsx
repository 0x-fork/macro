import { DOCS_BASE } from '@app/constants/docs-links';
import { LIST_VIEW_PATHS } from '@app/constants/list-views';
import { FavoriteIcon } from '@app/features/favorites/FavoriteIcon';
import { globalSplitManager } from '@app/signal/splitLayout';
import {
  favoriteSplitContent,
  useFavoriteDisplayName,
} from '@app/util/favorites';
import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import { useChatInputContext } from '@core/component/AI/context';
import { EntityIcon, getEntityIconType } from '@core/component/EntityIcon';
import { useSettingsState } from '@core/constant/SettingsState';
import { isMobile } from '@core/mobile/isMobile';
import type { Entity } from '@core/types';
import {
  compositeEntity,
  fetchNotificationsForEntities,
  openNotification,
} from '@notifications';
import ArrowUpRightIcon from '@phosphor/arrow-up-right.svg';
import BookOpenIcon from '@phosphor/book-open.svg';
import ChevronRightIcon from '@phosphor/caret-right.svg';
import PlusIcon from '@phosphor/plus.svg';
import XIcon from '@phosphor/x.svg';
import { createHomeRecommendations } from '@queries/ai/createHomeRecommendations';
import {
  deriveRecommendedView,
  type RecommendedAction,
  type RecommendedItem,
} from '@queries/ai/homeRecommendations';
import { useEmailLinksQuery } from '@queries/email/link';
import { useFavoritesData } from '@queries/favorites/favorites';
import { useMcpServersQuery } from '@queries/mcp-servers';
import type { Favorite } from '@service-storage/generated/schemas/favorite';
import { useNavigate } from '@solidjs/router';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { match } from 'ts-pattern';
import { replaceHomeComposerSelection } from './home-composer-selection';
import type { HomePreferences } from './home-prefs';
import { SetupRow } from './home-rows';

const STATUS: Record<RecommendedAction, { label: string; accent: boolean }> = {
  reply_now: { label: 'Reply now', accent: true },
  reply_later: { label: 'Reply later', accent: false },
  review: { label: 'Review', accent: false },
  discuss: { label: 'Discuss', accent: false },
};

/** Show the "Connect your tools" row until this many connections exist. */
const CONNECTION_GOAL = 4;
const COLLAPSED_RECOMMENDATIONS_COUNT = 3;
const STARTER_DOC_NAME = 'Macro how to guide';

const ATTACHABLE_ENTITY_TYPES = new Set<RecommendedItem['entityType']>([
  'channel',
  'document',
  'email_thread',
  'project',
]);

/** Temporary recommendations fixtures for UI testing */
const USE_DUMMY_RECOMMENDATIONS = true;
const DUMMY_RECOMMENDATION_ID_PREFIX = 'home-dummy-recommendation-';
const DUMMY_RECOMMENDATIONS: RecommendedItem[] = [
  {
    entityType: 'email_thread',
    entityId: `${DUMMY_RECOMMENDATION_ID_PREFIX}1`,
    title: 'Confirm the launch timeline with the product team',
    source: 'Maya Chen',
    action: 'reply_now',
    reason: 'Waiting on your approval',
    prompt: 'Draft a reply confirming the proposed launch timeline.',
  },
  {
    entityType: 'document',
    entityId: `${DUMMY_RECOMMENDATION_ID_PREFIX}2`,
    title: 'Review the Q3 planning brief',
    source: 'Product Planning',
    action: 'review',
    reason: 'Comments requested today',
    prompt: 'Review the Q3 planning brief and summarize the key risks.',
  },
  {
    entityType: 'channel',
    entityId: `${DUMMY_RECOMMENDATION_ID_PREFIX}3`,
    title: 'Resolve the onboarding flow decision',
    source: '#design-reviews',
    action: 'discuss',
    reason: 'Team needs a decision',
    prompt: 'Help me outline a decision for the onboarding flow discussion.',
  },
  {
    entityType: 'email_thread',
    entityId: `${DUMMY_RECOMMENDATION_ID_PREFIX}4`,
    title: 'Send feedback on the customer proposal',
    source: 'Jordan Patel',
    action: 'reply_later',
    reason: 'Feedback due tomorrow',
    prompt: 'Draft thoughtful feedback on the customer proposal.',
  },
  {
    entityType: 'project',
    entityId: `${DUMMY_RECOMMENDATION_ID_PREFIX}5`,
    title: 'Check the website refresh milestones',
    source: 'Website Refresh',
    action: 'review',
    reason: 'Two milestones are at risk',
    prompt: 'Review the website refresh milestones and identify blockers.',
  },
  {
    entityType: 'chat',
    entityId: `${DUMMY_RECOMMENDATION_ID_PREFIX}6`,
    title: 'Follow up on the analytics handoff',
    source: 'Alex Morgan',
    action: 'reply_now',
    reason: 'Handoff is blocked',
    prompt: 'Draft a concise follow-up about the analytics handoff.',
  },
  {
    entityType: 'document',
    entityId: `${DUMMY_RECOMMENDATION_ID_PREFIX}7`,
    title: 'Review edits to the hiring plan',
    source: 'People Operations',
    action: 'review',
    reason: 'New headcount assumptions',
    prompt: 'Review the hiring plan edits and flag material changes.',
  },
  {
    entityType: 'channel',
    entityId: `${DUMMY_RECOMMENDATION_ID_PREFIX}8`,
    title: 'Decide how to handle the beta feedback',
    source: '#customer-feedback',
    action: 'discuss',
    reason: 'Several reports overlap',
    prompt: 'Group the beta feedback into themes and suggest next steps.',
  },
  {
    entityType: 'email_thread',
    entityId: `${DUMMY_RECOMMENDATION_ID_PREFIX}9`,
    title: 'Reply to the partnership introduction',
    source: 'Sam Rivera',
    action: 'reply_later',
    reason: 'Introduction needs a response',
    prompt: 'Draft a warm response to the partnership introduction.',
  },
  {
    entityType: 'project',
    entityId: `${DUMMY_RECOMMENDATION_ID_PREFIX}10`,
    title: 'Prepare for the weekly execution review',
    source: 'Company Priorities',
    action: 'review',
    reason: 'Status review starts soon',
    prompt: 'Summarize the most important updates for the execution review.',
  },
];

function isDummyRecommendation(item: RecommendedItem) {
  return item.entityId.startsWith(DUMMY_RECOMMENDATION_ID_PREFIX);
}

/**
 * AI-recommended inbox items, generated by a fast projection for immediate
 * paint and upgraded in place when the smart projection lands. All branching
 * lives in `deriveRecommendedView`; this component only renders the result.
 */
export function RecommendedSection() {
  const input = useChatInputContext();
  const notificationSource = useGlobalNotificationSource();
  const { openSettings } = useSettingsState();
  const navigate = useNavigate();
  const [recommendationsExpanded, setRecommendationsExpanded] =
    createSignal(false);

  const emailLinks = useEmailLinksQuery();
  const recommendations = createHomeRecommendations();

  const view = () =>
    deriveRecommendedView({
      loading: emailLinks.isLoading || recommendations.isLoading(),
      failed:
        (emailLinks.isError && emailLinks.data === undefined) ||
        recommendations.hasError(),
      items: USE_DUMMY_RECOMMENDATIONS
        ? DUMMY_RECOMMENDATIONS
        : recommendations.items(),
      emailLinked: (emailLinks.data?.links.length ?? 0) > 0,
    });
  const items = () => {
    const current = view();
    return current.kind === 'items' ? current.items : [];
  };
  const visibleItems = () =>
    recommendationsExpanded()
      ? items()
      : items().slice(0, COLLAPSED_RECOMMENDATIONS_COUNT);

  const selectRecommendation = (item: RecommendedItem) => {
    replaceHomeComposerSelection(
      input,
      item.prompt,
      !isDummyRecommendation(item) &&
        ATTACHABLE_ENTITY_TYPES.has(item.entityType)
        ? [{ entity_id: item.entityId, entity_type: item.entityType }]
        : undefined
    );
  };

  const openRecommendation = async (item: RecommendedItem) => {
    if (isDummyRecommendation(item)) return;

    const splitManager = globalSplitManager();
    if (!splitManager) return;

    const entity = { id: item.entityId, type: item.entityType } as Entity;
    let notification =
      notificationSource.notificationsByEntity()[compositeEntity(entity)]?.[0];
    if (!notification) {
      notification = (await fetchNotificationsForEntities([entity]))[0];
    }

    if (notification) {
      const result = await openNotification(notification, splitManager);
      if (result.isOk()) {
        await notificationSource.markAsRead(notification);
        return;
      }
    }

    match(item.entityType)
      .with('email_thread', () =>
        splitManager.openWithSplit(
          { type: 'email', id: item.entityId },
          { activate: true }
        )
      )
      .with('channel', 'chat', 'call', 'project', (entityType) =>
        splitManager.openWithSplit(
          { type: entityType, id: item.entityId },
          { activate: true }
        )
      )
      .with('document', () => navigate(LIST_VIEW_PATHS.documents))
      .otherwise(() => navigate(LIST_VIEW_PATHS.inbox));
  };

  const retry = () => {
    void Promise.allSettled([emailLinks.refetch(), recommendations.retry()]);
  };

  return (
    <section>
      <div class="mb-2 flex items-center justify-between px-1">
        <span class="text-sm text-ink-muted">Recommended</span>
      </div>
      <div class="flex flex-col gap-2">
        <Switch>
          <Match when={view().kind === 'loading'}>
            <For each={[0, 1, 2]}>
              {() => (
                <div
                  class="group flex h-14 w-full shrink-0 items-center gap-3.5 rounded-xl border border-edge-muted bg-hover/40 px-4 py-3 text-left animate-pulse"
                  aria-hidden="true"
                />
              )}
            </For>
          </Match>
          <Match when={view().kind === 'error'}>
            <div class="group flex w-full items-center gap-3.5 rounded-xl border border-edge-muted bg-active px-4 py-3 text-left">
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-ink">
                  Recommendations are unavailable
                </div>
                <div class="text-xs text-ink-muted">
                  Check your connection and try again.
                </div>
              </div>
              <button
                type="button"
                class="shrink-0 text-sm text-accent hover:text-accent/80"
                onClick={retry}
              >
                Try again
              </button>
            </div>
          </Match>
          <Match when={view().kind === 'items'}>
            <For each={visibleItems()}>
              {(item) => (
                <RecommendedRow
                  item={item}
                  onSelect={() => selectRecommendation(item)}
                  onOpen={() => void openRecommendation(item)}
                />
              )}
            </For>
            <Show when={items().length > COLLAPSED_RECOMMENDATIONS_COUNT}>
              <button
                type="button"
                class="w-full rounded-lg py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-hover hover:text-ink"
                aria-expanded={recommendationsExpanded()}
                onClick={() =>
                  setRecommendationsExpanded((expanded) => !expanded)
                }
              >
                {recommendationsExpanded()
                  ? 'Collapse'
                  : `Show ${items().length - COLLAPSED_RECOMMENDATIONS_COUNT} more`}
              </button>
            </Show>
          </Match>
          <Match when={view().kind === 'connect-inbox'}>
            <button
              type="button"
              class="group flex w-full items-center gap-3.5 rounded-xl border border-edge-muted bg-active px-4 py-3 text-left transition-colors hover:bg-hover"
              onClick={() => openSettings('Email')}
            >
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-ink">
                  Connect your inbox
                </div>
                <div class="truncate text-xs text-ink-muted">
                  Macro reads & triages your email in seconds
                </div>
              </div>
              <span class="flex shrink-0 items-center gap-2 text-sm text-accent">
                <span class="size-1.5 rounded-full bg-accent" />
                Connect
              </span>
              <ChevronRightIcon class="size-4 shrink-0 text-ink-extra-muted" />
            </button>
          </Match>
          <Match when={view().kind === 'caught-up'}>
            <div class="group flex w-full items-center gap-3.5 rounded-xl border border-edge-muted bg-active px-4 py-3 text-left text-sm text-ink-muted">
              You're all caught up.
            </div>
          </Match>
        </Switch>
      </div>
    </section>
  );
}

/** Reactive count of linked inboxes + authenticated MCP servers. */
function useConnectionsCount() {
  const emailLinks = useEmailLinksQuery();
  const mcpServers = useMcpServersQuery();

  return () => {
    const inboxes = emailLinks.data?.links.length ?? 0;
    const servers = (mcpServers.data ?? []).filter(
      (server) => server.authenticated
    ).length;
    return inboxes + servers;
  };
}

/** Onboarding rows. Hidden on mobile. */
export function GettingStartedSection(props: { preferences: HomePreferences }) {
  const { openSettings } = useSettingsState();
  const connectionsCount = useConnectionsCount();
  const favoritesData = useFavoritesData();

  const showConnectRow = () => connectionsCount() < CONNECTION_GOAL;
  const documentFavorites = () =>
    (favoritesData()?.favorites ?? []).filter(
      (favorite) => favorite.entityType === 'document'
    );

  return (
    <Show when={!isMobile() && !props.preferences.isDismissed('setup')}>
      <section>
        <div class="mb-2 flex items-center justify-between px-1">
          <span class="text-sm text-ink-muted">Getting started</span>
          <button
            type="button"
            class="rounded-md p-1 text-ink-extra-muted transition-colors hover:bg-hover hover:text-ink-muted"
            aria-label="Dismiss getting started"
            onClick={() => props.preferences.dismiss('setup')}
          >
            <XIcon class="size-3.5" />
          </button>
        </div>
        <div class="flex flex-col gap-2">
          <Show when={showConnectRow()}>
            <SetupRow
              icon={<PlusIcon class="size-4" />}
              title="Connect your tools"
              desc="Link your inbox, Linear, Notion, GitHub & more"
              trailing={
                <span class="flex items-center gap-2">
                  <span class="text-xs tabular-nums text-ink-extra-muted">
                    {Math.min(connectionsCount(), CONNECTION_GOAL)}/
                    {CONNECTION_GOAL}
                  </span>
                  <ChevronRightIcon class="size-4 shrink-0 text-ink-extra-muted" />
                </span>
              }
              onActivate={() => openSettings('Connected')}
            />
          </Show>
          <For each={documentFavorites()}>
            {(favorite) => <StarterDocRow favorite={favorite} />}
          </For>
          <SetupRow
            icon={<BookOpenIcon class="size-4" />}
            title="Learn the basics"
            desc="Mentions, search, shortcuts & more"
            trailing={
              <ArrowUpRightIcon class="size-4 shrink-0 text-ink-extra-muted" />
            }
            href={DOCS_BASE}
          />
        </div>
      </section>
    </Show>
  );
}

 /**
  * Hacky, fragile method of linking to the starter doc, relying on the fact that it gets added to favorites, and has a certain name.
  */
function StarterDocRow(props: { favorite: Favorite }) {
  const displayName = useFavoriteDisplayName(props.favorite);

  return (
    <Show when={displayName() === STARTER_DOC_NAME}>
      <SetupRow
        icon={<FavoriteIcon favorite={props.favorite} />}
        title="Open your Macro how to guide"
        desc="Learn Macro's shortcuts, workflows & core features"
        trailing={
          <ChevronRightIcon class="size-4 shrink-0 text-ink-extra-muted" />
        }
        onActivate={() =>
          globalSplitManager()?.openWithSplit(
            favoriteSplitContent(props.favorite),
            { activate: true }
          )
        }
      />
    </Show>
  );
}

function RecommendedRow(props: {
  item: RecommendedItem;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const status = () => STATUS[props.item.action];
  return (
    <div class="group flex w-full shrink-0 items-stretch overflow-hidden rounded-xl border border-edge-muted bg-active transition-colors hover:border-edge">
      <div class="flex min-w-0 flex-1 items-center gap-3.5 px-4 py-3">
        <div class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-muted">
          <EntityIcon
            targetType={recommendedIconType(props.item.entityType)}
            size="xs"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium text-ink">
            {props.item.title}
          </div>
          <div class="mt-1 truncate text-xs text-ink-muted">
            {props.item.source} · {props.item.reason}
          </div>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-1 px-3 py-3">
        <button
          type="button"
          class="rounded-lg px-2 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          onClick={props.onSelect}
          aria-label={`${status().label} with AI about ${props.item.title}`}
        >
          {status().label}
        </button>
        <button
          type="button"
          class="rounded-lg px-2 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          onClick={(event) => {
            event.stopPropagation();
            props.onOpen();
          }}
          aria-label={`Open ${props.item.title}`}
        >
          Open
        </button>
      </div>
    </div>
  );
}

function recommendedIconType(entityType: RecommendedItem['entityType']) {
  switch (entityType) {
    case 'email_thread':
      return getEntityIconType({ type: 'email' });
    case 'channel':
      return getEntityIconType({ type: 'channel' });
    case 'chat':
      return getEntityIconType({ type: 'chat' });
    case 'document':
      return getEntityIconType({ type: 'document' });
    case 'project':
      return getEntityIconType({ type: 'project' });
    default:
      return 'default' as const;
  }
}
