import { useUnfurl } from '@core/signal/unfurl';
import GithubLogo from '@icon/regular/github-logo.svg';
import {
  getGithubSlug,
  type GithubMentionDecoratorProps,
} from '@lexical-core';
import { createMemo, useContext } from 'solid-js';
import { LexicalWrapperContext } from '../../context/LexicalWrapperContext';

export function GithubMention(props: GithubMentionDecoratorProps) {
  const lexicalWrapper = useContext(LexicalWrapperContext);
  const selection = () => lexicalWrapper?.selection;

  const [unfurlData] = useUnfurl(props.url);

  const label = createMemo(() => {
    const data = unfurlData();
    if (data?.type === 'success' && data.data.title) {
      return data.data.title;
    }
    return getGithubSlug(props.url);
  });

  const isSelectedAsNode = () => {
    const sel = selection();
    if (!sel) return false;
    return sel.type === 'node' && sel.nodeKeys.has(props.key);
  };

  const openLink = () => {
    window.open(props.url, '_blank');
  };

  return (
    <span
      class="relative py-0.5 px-0.5 rounded-xs bg-accent/8 hover:bg-accent/20 focus:bg-accent/20 text-accent-ink cursor-pointer"
      classList={{
        'bracket-offset-2': isSelectedAsNode(),
      }}
      onClick={openLink}
      title={props.url}
    >
      <span class="relative top-[0.125em] size-[1em] inline-flex mx-0.5">
        <GithubLogo class="w-full h-full" />
      </span>
      <span data-github-mention="true" data-github-url={props.url}>
        {label()}
      </span>
    </span>
  );
}
