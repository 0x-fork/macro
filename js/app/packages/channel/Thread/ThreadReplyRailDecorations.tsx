import type { Accessor } from 'solid-js';

type ThreadReplyRailProps = {
  isReplying: Accessor<boolean>;
  firstThreadReplyNewMessage?: boolean;
};

export function ThreadReplyRailDecorations(_props: ThreadReplyRailProps) {
  return null;
}
