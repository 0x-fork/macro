import Spinner from '@phosphor-icons/core/bold/spinner-gap-bold.svg?component-solid';
import { Button, cn } from '@ui';
import { type Accessor, type JSX, Show } from 'solid-js';

export function AttachmentSection(props: {
  contentClass?: string;
  children: JSX.Element;
  action?: JSX.Element;
  class?: string;
  label: string;
}) {
  return (
    <div class={cn('rounded-sm py-3', props.class)}>
      <div class="flex items-center justify-between pb-2">
        <h3 class="text-sm font-medium text-ink">{props.label}</h3>
        <div class="shrink-0">{props.action}</div>
      </div>
      <div class={cn('pt-2', props.contentClass)}>{props.children}</div>
    </div>
  );
}

export function LoadMoreButton(props: {
  onLoadMore: () => void;
  isFetching: Accessor<boolean>;
}) {
  return (
    <Button
      variant="base"
      size="sm"
      depth={4}
      class="justify-self-center mt-2 bg-surface"
      onClick={() => props.onLoadMore()}
      disabled={props.isFetching()}
    >
      <Show
        when={!props.isFetching()}
        fallback={
          <>
            <Spinner class="size-3.5 animate-spin" />
            Loading...
          </>
        }
      >
        Load More
      </Show>
    </Button>
  );
}
