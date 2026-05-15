import {
  createFindBarController,
  type FindBarController,
} from '@core/component/createFindBarController';
import { extractSearchTerms } from '@core/util/searchHighlight';
import {
  type ChannelMessageEntity,
  isChannelMessageEntity,
  type WithSearch,
} from '@entity';
import { channelMessagesQueryOptions } from '@queries/channel/channel-messages';
import { threadRepliesQueryOptions } from '@queries/channel/thread-replies';
import { queryClient } from '@queries/client';
import {
  useSearchChannelQuery,
  validateSearchServiceText,
} from '@queries/soup/search';
import {
  ChannelSortDirection,
  ChannelSortTimestamp,
} from '@service-search/generated/models';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSelector,
} from 'solid-js';
import type { SearchHighlightTermsLookup } from '../Message/context';

const FIND_BAR_PAGE_SIZE = 50;
const FIND_BAR_PREFETCH_THRESHOLD = 10;
const FIND_BAR_REPLY_PREFETCH_LOOKAHEAD = 2;
const FIND_BAR_MESSAGES_PREFETCH_LOOKAHEAD = 2;

/**
 * Indices the user is likely to navigate to next, given a current 1-based
 * `idx` in a list of `total` results. Walks `lookahead` steps in BOTH
 * directions and wraps around at the boundaries — so `idx=1` covers both
 * idx 2..lookahead+1 (forward) and `total..total-lookahead+1` (backward
 * wrap), matching the bidirectional + wraparound navigation model of the
 * find bar.
 */
function nearbyIndices(
  idx: number,
  total: number,
  lookahead: number
): number[] {
  if (total === 0) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (i: number) => {
    if (!seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  };
  for (let delta = 1; delta <= lookahead; delta++) {
    add(((idx - 1 + delta) % total) + 1);
    add(((idx - 1 - delta + total) % total) + 1);
  }
  return out;
}

type CreateChannelFindBarOptions = {
  channelId: Accessor<string>;
  goToMessage: (messageId: string, replyId?: string) => void;
  clearSelection: () => void;
  isMessageLoaded: (messageId: string) => boolean;
};

export type ChannelFindBar = FindBarController & {
  /** Per-message highlight terms derived from loaded search results. */
  getSearchTermsForMessage: SearchHighlightTermsLookup;
};

type ActiveMatch = { messageId: string; terms: string[] };

export function createChannelFindBar(
  options: CreateChannelFindBarOptions
): ChannelFindBar {
  let activeMatch: Accessor<ActiveMatch | undefined> = () => undefined;

  const controller = createFindBarController<WithSearch<ChannelMessageEntity>>(
    ({ isOpen, submittedQuery, activeIndex }) => {
      // Two parallel queries: `head` pages forward from the newest match, `tail`
      // pages backward from the oldest. Both fire as soon as the find bar opens
      // so backward wraparound (index 1 → index N) lands instantly on the
      // already-cached tail page instead of waiting for the head to paginate
      // through every intermediate result.
      const makeBody = (direction: ChannelSortDirection) => ({
        match_type: 'partial' as const,
        query: submittedQuery(),
        search_on: 'content' as const,
        channel_ids: [options.channelId()],
        sort: ChannelSortTimestamp.thread,
        sort_direction: direction,
      });
      const enabled = () => ({
        enabled: isOpen() && submittedQuery().length > 0,
      });

      const headQuery = useSearchChannelQuery(
        () => ({
          params: { page_size: FIND_BAR_PAGE_SIZE },
          body: makeBody(ChannelSortDirection.desc),
        }),
        enabled
      );
      const tailQuery = useSearchChannelQuery(
        () => ({
          params: { page_size: FIND_BAR_PAGE_SIZE },
          body: makeBody(ChannelSortDirection.asc),
        }),
        enabled
      );

      const inChannel = (e: WithSearch<ChannelMessageEntity>) =>
        isChannelMessageEntity(e) && e.channelId === options.channelId();

      const headItems = createMemo<WithSearch<ChannelMessageEntity>[]>(() => {
        if (!submittedQuery()) return [];
        if (headQuery.isPlaceholderData) return [];
        if (!headQuery.isSuccess) return [];
        return (
          headQuery.data?.items.filter(
            (e): e is WithSearch<ChannelMessageEntity> => inChannel(e)
          ) ?? []
        );
      });

      // tailQuery returns matches in ascending order; flip to descending so the
      // unified index space (1 = newest, totalCount = oldest) stays monotonic.
      const tailItems = createMemo<WithSearch<ChannelMessageEntity>[]>(() => {
        if (!submittedQuery()) return [];
        if (tailQuery.isPlaceholderData) return [];
        if (!tailQuery.isSuccess) return [];
        return (
          tailQuery.data?.items
            .filter((e): e is WithSearch<ChannelMessageEntity> => inChannel(e))
            .slice()
            .reverse() ?? []
        );
      });

      const totalCount = createMemo<number | undefined>(() => {
        if (!submittedQuery()) return undefined;
        if (headQuery.isPlaceholderData) return undefined;
        if (!headQuery.isSuccess) return undefined;
        return headQuery.data?.totalCount;
      });

      const resultAt = (
        idx: number
      ): WithSearch<ChannelMessageEntity> | undefined => {
        const head = headItems();
        if (idx <= head.length) return head[idx - 1];
        const total = totalCount();
        if (total === undefined) return undefined;
        const tail = tailItems();
        const tailStart = total - tail.length + 1;
        if (idx >= tailStart) return tail[idx - tailStart];
        return undefined;
      };

      // Highlight only the active match so we never paint spans we don't
      // have hit data for (results outside the loaded page have no terms).
      activeMatch = createMemo<ActiveMatch | undefined>(() => {
        if (!isOpen()) return undefined;
        const idx = activeIndex();
        if (idx === 0) return undefined;
        const entity = resultAt(idx);
        if (!entity) return undefined;
        const termSet = new Set<string>();
        for (const hit of entity.search.contentHitData ?? []) {
          for (const term of extractSearchTerms(hit.content)) {
            if (term.length) termSet.add(term);
          }
        }
        if (termSet.size === 0) return undefined;
        return { messageId: entity.messageId, terms: [...termSet] };
      });

      // Prefetch toward the side the cursor is leaning into.
      createEffect(() => {
        const idx = activeIndex();
        const total = totalCount();
        if (idx === 0 || !total) return;
        const head = headItems();
        const tail = tailItems();
        const headSlack = head.length - idx;
        const tailSlack = idx - (total - tail.length + 1);
        if (
          headSlack >= 0 &&
          headSlack <= FIND_BAR_PREFETCH_THRESHOLD &&
          headQuery.hasNextPage &&
          !headQuery.isFetchingNextPage
        ) {
          headQuery.fetchNextPage();
        }
        if (
          tailSlack >= 0 &&
          tailSlack <= FIND_BAR_PREFETCH_THRESHOLD &&
          tailQuery.hasNextPage &&
          !tailQuery.isFetchingNextPage
        ) {
          tailQuery.fetchNextPage();
        }
      });

      // Prefetch /replies for hits the user is about to land on. Walks
      // forward AND backward from the active index and wraps around at
      // either boundary, since either direction is one hotkey away.
      // ChannelThread fires the replies query only on mount with
      // `targetReplyId` set, so the very first reply-nav into each thread
      // always pays a round-trip. Warming the cache in advance hides that
      // latency on rapid next/prev. `prefetchQuery` is a no-op when the
      // cached entry is fresh (staleTime is Infinity for replies), so
      // re-runs are cheap.
      createEffect(() => {
        const total = totalCount();
        const idx = activeIndex();
        if (idx === 0 || !total) return;

        const channelId = options.channelId();
        for (const i of nearbyIndices(
          idx,
          total,
          FIND_BAR_REPLY_PREFETCH_LOOKAHEAD
        )) {
          const threadId = resultAt(i)?.threadId;
          if (!threadId) continue;
          queryClient.prefetchQuery(
            threadRepliesQueryOptions(channelId, threadId)
          );
        }
      });

      // Prefetch the load-around channel-messages window for upcoming hits
      // in either direction (forward, backward, or across a wraparound).
      // When the user navigates to a result that's outside the current
      // message window, tmc switches `loadAroundMessageId` to that id and
      // `/messages?load_around_message_id=…` fetches a 50-row window
      // centered on it. That round-trip is the dominant delay on rapid
      // find-bar navigation through older messages. Skip hits that are
      // already in the loaded window (we'd never actually fire an
      // around-fetch for them) and dedupe so multiple replies to the same
      // parent thread share one prefetch.
      createEffect(() => {
        const total = totalCount();
        const idx = activeIndex();
        if (idx === 0 || !total) return;

        const channelId = options.channelId();
        const seen = new Set<string>();
        for (const i of nearbyIndices(
          idx,
          total,
          FIND_BAR_MESSAGES_PREFETCH_LOOKAHEAD
        )) {
          const hit = resultAt(i);
          if (!hit) continue;
          const aroundId = hit.threadId ?? hit.messageId;
          if (seen.has(aroundId)) continue;
          seen.add(aroundId);
          if (options.isMessageLoaded(aroundId)) continue;
          queryClient.prefetchInfiniteQuery(
            channelMessagesQueryOptions(channelId, aroundId)
          );
        }
      });

      const loadToIndex = async (idx: number) => {
        const total = totalCount();
        if (!total) return;
        // Resolve via whichever side has fewer pages to fetch.
        while (resultAt(idx) === undefined) {
          const head = headItems();
          const tail = tailItems();
          const headDistance = idx - head.length;
          const tailDistance = total - tail.length + 1 - idx;
          const preferHead =
            headDistance > 0 &&
            (tailDistance <= 0 || headDistance <= tailDistance);
          const preferTail = tailDistance > 0 && !preferHead;
          if (preferHead && headQuery.hasNextPage) {
            await headQuery.fetchNextPage();
          } else if (preferTail && tailQuery.hasNextPage) {
            await tailQuery.fetchNextPage();
          } else {
            return;
          }
        }
      };

      return {
        results: headItems,
        totalCount,
        resultAt,
        loadToIndex,
        isFetching: () => headQuery.isFetching || tailQuery.isFetching,
        validateText: validateSearchServiceText,
        navigate: (result) => {
          if (result.threadId) {
            options.goToMessage(result.threadId, result.messageId);
          } else {
            options.goToMessage(result.messageId);
          }
        },
      };
    },
    {
      onBeforeSubmit: () => options.clearSelection(),
    }
  );

  const isActiveMessage = createSelector<string | undefined, string>(
    () => activeMatch()?.messageId
  );

  const getSearchTermsForMessage: SearchHighlightTermsLookup = (messageId) =>
    isActiveMessage(messageId) ? activeMatch()?.terms : undefined;

  return { ...controller, getSearchTermsForMessage };
}
