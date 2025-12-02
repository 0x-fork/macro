import { useGlobalNotificationSource } from '@app/component/GlobalAppState';
import { withAnalytics } from '@coparse/analytics';
import { DocumentBlockContainer } from '@core/component/DocumentBlockContainer';
import { EmailDebouncedReadMarker } from '@notifications';
import { createEffect, createMemo, onCleanup, onMount, Show } from 'solid-js';
import { blockDataSignal } from '../signal/emailBlockData';
import { createThreadMessagesResource } from '../signal/threadMessages';
import { markThreadAsSeen } from '../util/markThreadAsSeen';
import { Email } from './Email';

const { track, TrackingEvents } = withAnalytics();

export default function BlockEmail() {
  const blockData = blockDataSignal.get;
  const notificationSource = useGlobalNotificationSource();

  // AbortController for cleanup on unmount
  const abortController = new AbortController();

  const title = createMemo(() => {
    const data = blockData();
    if (!data || !data.thread || data.thread.messages.length === 0) return '';
    if (data.thread.messages[0].subject?.length === 0) return '[No subject]';
    return data.thread.messages[0].subject!;
  });

  // Memoize resource creation - only create once per threadId, not on every blockData change
  let cachedResource: ReturnType<typeof createThreadMessagesResource> | null =
    null;
  let cachedThreadId: string | undefined;

  const threadMessagesResource = createMemo(() => {
    const data = blockData();
    const threadId = data?.thread?.db_id;

    if (!threadId) {
      cachedResource = null;
      cachedThreadId = undefined;
      return null;
    }

    // Only create a new resource if threadId changed
    if (threadId !== cachedThreadId) {
      cachedThreadId = threadId;
      cachedResource = createThreadMessagesResource(threadId, data.thread);
    }

    return cachedResource;
  });

  const threadData = createMemo(() => {
    const resource = threadMessagesResource();
    const resourceData = resource?.resource();
    return resourceData?.thread;
  });

  onMount(() => {
    track(TrackingEvents.BLOCKEMAIL.OPEN);
  });

  // Abort pending requests on unmount
  onCleanup(() => {
    abortController.abort();
  });

  // Mark all messages as read
  createEffect(() => {
    const data = blockData();
    if (!data) return;
    let initialThreadLoad = data.thread;
    if (!initialThreadLoad.db_id) return;

    markThreadAsSeen(initialThreadLoad.db_id, abortController.signal);
  });

  return (
    <DocumentBlockContainer title={title() ?? 'Email'}>
      <div class="size-full bracket-never" tabIndex={-1}>
        <Show when={blockData()}>
          <Show when={blockData()?.thread?.db_id}>
            {(threadId) => {
              return (
                <EmailDebouncedReadMarker
                  notificationSource={notificationSource}
                  threadId={threadId()}
                />
              );
            }}
          </Show>

          <Email
            title={title}
            threadMessagesResource={threadMessagesResource}
            threadData={threadData}
          />
        </Show>
      </div>
    </DocumentBlockContainer>
  );
}
