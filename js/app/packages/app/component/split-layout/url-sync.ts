import { useNavigate } from '@solidjs/router';
import { type Accessor, createEffect, createMemo, on } from 'solid-js';
import type { SplitContent, SplitManager } from './layoutManager';
import { decodePairs } from './layoutUtils';

function sameSplitContentIdentity(a: SplitContent, b: SplitContent) {
  return a.type === b.type && a.id === b.id;
}

/**
 * Transient panes (e.g. the loading pane shown while a create call resolves)
 * must never persist as browser history entries: navigating away from one
 * always replaces its entry, so browser back can't land on it.
 */
function isTransientPair(pair: SplitContent | undefined) {
  return pair?.type === 'component' && pair.id === 'loading';
}

function getUrlSyncChange(
  splitManager: SplitManager,
  currentPairs: SplitContent[],
  nextPairs: SplitContent[]
) {
  const changedIndex = nextPairs.findIndex(
    (nextPair, index) =>
      !currentPairs[index] ||
      !sameSplitContentIdentity(currentPairs[index], nextPair)
  );

  if (changedIndex < 0) return undefined;

  const affectedPair = nextPairs[changedIndex];
  return {
    previousPair: currentPairs[changedIndex],
    affectedSplit: splitManager
      .splits()
      .find((split) => sameSplitContentIdentity(split.content, affectedPair)),
  };
}

/**
 * Creates an effect that syncs the layout manager with the URL.
 *
 * @param splitManager The layout manager to sync with
 * @param pairs The accessor to the current pairs
 * @param decodedPairs The accessor to the decoded pairs
 */
export function createLayoutUrlSync(
  splitManager: SplitManager,
  pairs: Accessor<string[]>,
  decodedPairs: Accessor<SplitContent[]>
) {
  const navigate = useNavigate();
  const urlLayoutDrift = createMemo(
    () => splitManager.getUrlSegments().join('/') !== pairs().join('/')
  );

  /** Syncs changes from the layout manager to the URL*/
  createEffect(
    on([() => splitManager.getUrlSegments().join('/')], () => {
      if (urlLayoutDrift()) {
        const nextUrlSegments = splitManager.getUrlSegments();
        const nextPairs = decodePairs(nextUrlSegments);
        const change = getUrlSyncChange(
          splitManager,
          decodedPairs(),
          nextPairs
        );
        const replace =
          change?.affectedSplit?.lastNavigationCause === 'replace' ||
          isTransientPair(change?.previousPair);

        // Flush the state to the url
        navigate(`/${nextUrlSegments.join('/')}`, { replace });
      }
    })
  );

  /** Syncs changes from the URL to the layout manager */
  createEffect(
    on([pairs], () => {
      if (urlLayoutDrift()) {
        splitManager.reconcile(decodedPairs());
      }
    })
  );
}
