import UsersIcon from '@phosphor/users.svg';
import { cn } from '@ui';
import { Show } from 'solid-js';

function githubAvatarUrl(login: string): string {
  return `https://github.com/${login.replace(/\[bot\]$/, '')}.png?size=48`;
}

export function AuthorAvatar(props: { login?: string; class?: string }) {
  return (
    <Show
      when={props.login}
      fallback={
        <span
          class={cn(
            'flex items-center justify-center rounded-full bg-ink/10 text-ink-muted',
            props.class
          )}
        >
          <UsersIcon class="size-3" />
        </span>
      }
    >
      {(login) => (
        <img
          src={githubAvatarUrl(login())}
          alt={login()}
          loading="lazy"
          class={cn('rounded-full ring ring-edge-muted', props.class)}
        />
      )}
    </Show>
  );
}
