import {
  getFullNameFromRepoId,
  type GitHubRepoMentionDecoratorProps,
} from '@lexical-core';
import GitHubIcon from '@macro-icons/macro-github.svg';
import { createGitHubRepoQuery } from '@macro-entity';
import { createEffect, createSignal, onCleanup, type ParentProps } from 'solid-js';

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
      class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm"
      classList={{
        'bg-primary-hover cursor-pointer hover:bg-primary-active transition-colors': !isError(),
        'bg-error-subtle': isError(),
      }}
      onClick={!isError() ? handleClick : undefined}
      data-github-repo-mention="true"
      data-repo-id={props.repoId}
      data-mention-uuid={props.mentionUuid || ''}
      title={titleText()}
    >
      <GitHubIcon
        class="h-3.5 w-3.5"
        classList={{ 'animate-pulse': loading() }}
      />
      {avatarUrl() && (
        <img
          src={avatarUrl()}
          alt={owner()}
          class="h-3.5 w-3.5 rounded-full"
        />
      )}
      {isError() ? (
        <span class="text-error">{errorMessage()}</span>
      ) : (
        <span class="font-medium">{displayName()}</span>
      )}
    </span>
  );
}
