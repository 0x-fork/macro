import type { GitHubRepoMentionDecoratorProps } from '@lexical-core';
import GitHubIcon from '@macro-icons/macro-github.svg';
import { type ParentProps, Show } from 'solid-js';

type GitHubRepoMentionProps = ParentProps<GitHubRepoMentionDecoratorProps>;

export function GitHubRepoMention(props: GitHubRepoMentionProps) {
  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(props.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <span
      class="inline-flex items-center gap-1 rounded bg-primary-hover px-1.5 py-0.5 text-sm cursor-pointer hover:bg-primary-active transition-colors"
      onClick={handleClick}
      data-github-repo-mention="true"
      data-repo-id={props.repoId}
      data-full-name={props.fullName}
      data-owner={props.owner}
      data-avatar-url={props.avatarUrl}
      data-url={props.url}
      data-mention-uuid={props.mentionUuid || ''}
    >
      <GitHubIcon class="h-3.5 w-3.5" />
      <Show when={props.avatarUrl}>
        <img
          src={props.avatarUrl}
          alt={props.owner}
          class="h-3.5 w-3.5 rounded-full"
        />
      </Show>
      <span class="font-medium">{props.fullName}</span>
    </span>
  );
}
