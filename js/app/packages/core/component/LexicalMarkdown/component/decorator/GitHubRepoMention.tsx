import {
  getFullNameFromRepoId,
  type GitHubRepoMentionDecoratorProps,
} from '@lexical-core';
import GitHubIcon from '@icon/regular/github-logo.svg';
import LoadingSpinner from '@icon/regular/spinner.svg';
import { createGitHubRepoQuery } from '@macro-entity';
import {
  createEffect,
  createSignal,
  onCleanup,
  Show,
  type ParentProps,
} from 'solid-js';

type GitHubRepoMentionProps = ParentProps<GitHubRepoMentionDecoratorProps>;

export function GitHubRepoMention(props: GitHubRepoMentionProps) {
  const fullName = getFullNameFromRepoId(props.repoId);
  const repoQuery = createGitHubRepoQuery(props.repoId);

  // Copy query state to local signals to decouple reactivity during cleanup
  const [data, setData] = createSignal(repoQuery.data);
  const [error, setError] = createSignal(repoQuery.error);
  const [loading, setLoading] = createSignal(repoQuery.isLoading);

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  createEffect(() => {
    // Read reactive values
    const newData = repoQuery.data;
    const newError = repoQuery.error;
    const newLoading = repoQuery.isLoading;
    // Only update if not disposed
    if (!disposed) {
      setData(newData);
      setError(newError);
      setLoading(newLoading);
    }
  });

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = data()?.url;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.open(`https://github.com/${fullName}`, '_blank', 'noopener,noreferrer');
    }
  };

  const displayName = () => data()?.fullName ?? fullName;
  const avatarUrl = () => data()?.avatarUrl;
  const owner = () => data()?.owner ?? '';
  const titleText = () => data()?.description || displayName();
  const isError = () => !!error();

  const errorMessage = () => {
    const err = error();
    if (!err) return null;
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'REPO_NOT_FOUND') return 'Repository not found';
    if (msg === 'GITHUB_NOT_LINKED') return 'GitHub not linked';
    return 'Error loading repo';
  };

  return (
    <span
      class="py-0.5 cursor-default rounded-xs hover:bg-hover focus:bg-active"
      onClick={!isError() ? handleClick : undefined}
      data-github-repo-mention="true"
      data-repo-id={props.repoId}
      data-mention-uuid={props.mentionUuid || ''}
      title={titleText()}
    >
      <span class="pointer-events-auto">
        {/* Icon */}
        <span class="relative top-[0.125em] size-[1em] inline-flex mx-1">
          <Show
            when={!loading()}
            fallback={
              <div class="animate-spin">
                <LoadingSpinner />
              </div>
            }
          >
            <GitHubIcon class="size-full" />
          </Show>
        </span>

        {/* Text */}
        <Show
          when={!isError()}
          fallback={
            <span class="underline decoration-error/20 decoration-[max(1px,0.1em)] underline-offset-2 text-error">
              {errorMessage()}
            </span>
          }
        >
          <span
            class="underline decoration-current/20 decoration-[max(1px,0.1em)] underline-offset-2"
            data-github-repo-mention="true"
            data-repo-id={props.repoId}
          >
            {displayName()}
          </span>
        </Show>
      </span>
    </span>
  );
}
