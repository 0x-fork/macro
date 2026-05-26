import { useUserId } from '@core/context/user';
import { cn } from '@ui';
import { For, Show } from 'solid-js';
import { useMessage, useMessageActions } from './context';
import { ReactionChip } from './ReactionChip';

type ReactionsProps = {
  class?: string;
};

export function Reactions(props: ReactionsProps) {
  const message = useMessage();
  const actions = useMessageActions();
  const userId = useUserId();

  const canReact = () => actions?.onReact !== undefined;

  return (
    <Show when={message().reactions.length > 0}>
      <div
        class={cn(
          'flex flex-row flex-wrap items-center gap-1 mt-0.5 mb-1',
          props.class
        )}
        data-message-reactions-row
      >
        <For each={message().reactions}>
          {(reaction) => {
            const didCurrentUserReact = () =>
              !!userId() && reaction.users.includes(userId()!);

            return (
              <ReactionChip
                emoji={reaction.emoji}
                count={reaction.users.length}
                users={reaction.users}
                currentUserId={userId() ?? undefined}
                selected={didCurrentUserReact()}
                interactive={canReact()}
                onClick={(event) => {
                  void actions?.onReact?.({
                    message: message(),
                    event,
                    emoji: reaction.emoji,
                  });
                }}
              />
            );
          }}
        </For>
      </div>
    </Show>
  );
}
