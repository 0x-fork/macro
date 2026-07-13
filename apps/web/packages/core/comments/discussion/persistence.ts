import {
  createPersistenceKey,
  type PersistenceKey,
} from '@queries/persistence';

type DiscussionPersistenceProps = {
  discussionId: string;
  threadId?: string;
};

const INPUT_VALUE_PREFIX = 'discussion-input-value';
const INPUT_VALUE_VERSION = 0;

/** Scoped like `makeInputValuePersistenceKey` for channels, one namespace per discussion (+ thread). */
export function makeDiscussionInputPersistenceKey(
  props: DiscussionPersistenceProps
): PersistenceKey {
  return createPersistenceKey(
    `${INPUT_VALUE_PREFIX}-discussion:${props.discussionId}${props.threadId ? `-thread:${props.threadId}` : ''}`,
    INPUT_VALUE_VERSION
  );
}
