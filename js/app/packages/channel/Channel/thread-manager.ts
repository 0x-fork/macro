import type { InputHandle, InputSnapshot } from '@channel/Input';
import { batch, createSignal, type Setter } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { ThreadState } from '../Thread';

type ThreadStore = Record<string, ThreadState>;
export function createThreadManager() {
  const [threadStore, setThreadStore] = createStore<ThreadStore>({});

  function initThreadState(threadId: string): ThreadState {
    const [isExpanded, setIsExpanded] = createSignal<boolean>(false);
    const [isReplying, setIsReplyingRaw] = createSignal<boolean>(false);
    const [replyInputState, setReplyInputState] = createSignal<
      InputSnapshot | undefined
    >();
    const [replyInputEl, setReplyInputEl] = createSignal<
      HTMLElement | undefined
    >();
    const [replyInputHandle, setReplyInputHandle] = createSignal<
      InputHandle | undefined
    >();

    // Set when replying goes false -> true (genuine user intent to reply).
    // Read once by the reply input on mount; virtualized remounts keep
    // `isReplying` true so they never set it and never steal focus.
    let focusReplyOnMount = false;

    /** If you set replying from false -> true this means it must be expanded **/
    const setIsReplying: Setter<boolean> = (val) => {
      batch(() => {
        const next: boolean =
          typeof val === 'function' ? val(isReplying()) : val;
        if (next && !isReplying()) focusReplyOnMount = true;
        if (next) {
          setIsExpanded(true);
          requestAnimationFrame(() =>
            replyInputEl()?.scrollIntoView({ block: 'nearest' })
          );
        }
        setIsReplyingRaw(next);
      });
    };

    const consumeReplyFocus = () => {
      const should = focusReplyOnMount;
      focusReplyOnMount = false;
      return should;
    };

    const state: ThreadState = {
      isExpanded,
      setIsExpanded,
      isReplying,
      setIsReplying,
      replyInputState,
      setReplyInputState,
      replyInputEl,
      setReplyInputEl,
      replyInputHandle,
      setReplyInputHandle,
      consumeReplyFocus,
    };

    setThreadStore(threadId, state);

    return state;
  }

  function getOrCreateThreadState(threadId: string): ThreadState {
    const threadState = threadStore[threadId];

    if (threadState) return threadState;

    return initThreadState(threadId);
  }

  return {
    getOrCreateThreadState,
  };
}
