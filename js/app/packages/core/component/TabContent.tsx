import { type JSX, type ParentProps, Show } from 'solid-js';

interface TabContentProps {
  title: string;
  description?: string | JSX.Element;
  header?: JSX.Element;
  children: JSX.Element;
}

interface TabContentRowProps {
  text: string;
  subtext: string | JSX.Element;
  subtext2?: string;
  isLoading?: boolean;
}

export function TabContentRow(props: ParentProps<TabContentRowProps>) {
  return (
    <div class="mb-[18px]">
      <div class="text-sm">{props.text}</div>
      <Show
        when={!props.isLoading}
        fallback={
          <div class="animate-pulse bg-ink-extra-muted rounded max-w-[100px] min-h-[20px] leading-5"></div>
        }
      >
        <div class="text-ink-muted text-xs leading-5">{props.subtext}</div>
        {props.children}
      </Show>
    </div>
  );
}
