import { useSoupView } from '@app/features/soup-view/context';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { buildConfig } from '@core/component/LexicalMarkdown/builder/MarkdownConfigBuilder';
import { MarkdownShell } from '@core/component/LexicalMarkdown/builder/MarkdownShell';
import SearchIcon from '@icon/macro-magnifying-glass.svg';
import { markdownToPlainText } from '@macro-inc/lexical-core/utils/parsers';
import XIcon from '@phosphor/x.svg?component-solid';
import { cn, Hotkey } from '@ui';
import {
  $selectAll,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
} from 'lexical';
import {
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';

type SearchbarVariant = 'filled' | 'secondary';

export type SoupSearchbarProps = {
  variant?: SearchbarVariant;
  autoFocus?: boolean;
  onDismiss?: () => void;
  placeholder?: string;
  initialValue?: string;
};

const variantStyles: Record<SearchbarVariant, string> = {
  filled:
    'bg-ink/5 text-ink-muted hover:bg-ink/7 hover:text-ink border-edge-muted focus-within:bg-ink/7 focus-within:text-ink focus-within:border-accent',
  secondary:
    'bg-surface text-ink-muted border-edge-muted hover:text-ink focus-within:text-ink focus-within:border-accent',
};

/** Original Soup search editor ported to the facet-native collection state. */
export function SoupSearchbar(props: SoupSearchbarProps) {
  const {
    collection,
    searchControl: registeredSearchControl,
    setSearchControl,
  } = useSoupView();
  const panel = useSplitPanelOrThrow();
  const persistedSearchText = panel.handle.currentEntryState()?.['search.text'];
  const initialEditorValue =
    typeof persistedSearchText === 'string'
      ? persistedSearchText
      : collection.state.search || props.initialValue;
  const [hasContent, setHasContent] = createSignal(
    Boolean(initialEditorValue?.trim())
  );
  const [latestMarkdown, setLatestMarkdown] = createSignal(
    initialEditorValue ?? ''
  );

  const editor = buildConfig('chat')
    .namespace('soup-search-bar')
    .singleLine()
    .withMentions({
      sources: ['users'],
      disableMentionTracking: true,
    })
    .withHistory({ timeGap: 400 })
    .onChange((markdown) => {
      setLatestMarkdown(markdown);
      setHasContent(markdown.trim().length > 0);
    })
    .onEnter(() => {
      if (menuIsOpen()) return false;
      editor.controls.blur();
      return true;
    })
    .onEscape(() => {
      editor.controls.blur();
      props.onDismiss?.();
      return true;
    })
    .onTab((event) => {
      event.preventDefault();
      return true;
    })
    .use((lexical) =>
      lexical.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => {
          if (menuIsOpen()) return false;
          lexical.getRootElement()?.blur();
          return true;
        },
        COMMAND_PRIORITY_HIGH
      )
    );

  const menuIsOpen = () => editor.controls.isInlineMenuOpen();

  createEffect(() => collection.setState('searchPaused', menuIsOpen()));
  createEffect(
    on(latestMarkdown, (markdown) => {
      if (menuIsOpen()) return;
      collection.setState('search', markdownToPlainText(markdown).trim());
    })
  );

  // External Search navigation writes plain text into the collection. Keep the
  // editor synchronized without replacing mention markdown during local edits.
  createEffect(
    on(
      () => collection.state.search,
      (search) => {
        const current = markdownToPlainText(latestMarkdown()).trim();
        if (search === current) return;
        editor.controls.setMarkdown(search);
        setLatestMarkdown(search);
        setHasContent(search.trim().length > 0);
      }
    )
  );

  const searchControl = {
    focus: (selectAll = false) => {
      editor.controls.focus();
      if (selectAll) {
        editor.controls.getLexical().update(() => $selectAll());
      }
    },
  };

  onMount(() => setSearchControl(searchControl));
  onCleanup(() => {
    collection.setState('searchPaused', false);
    if (registeredSearchControl() === searchControl)
      setSearchControl(undefined);
  });

  return (
    <div
      class="w-full items-center shrink-0 grow min-w-0 mobile:-order-2"
      data-search-bar-wrapper
      data-no-focus-restore
      onFocusOut={(event) => {
        if (hasContent() || !props.onDismiss) return;
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        props.onDismiss();
      }}
    >
      <div
        class={cn(
          'group w-full relative flex items-center gap-1 rounded-lg h-7 mobile:h-9 pl-1 pr-1 py-1 mobile:min-w-35 border text-xs',
          variantStyles[props.variant ?? 'secondary']
        )}
      >
        <SearchIcon class="size-4 shrink-0" />
        <div
          data-soup-search
          class="flex-1 min-w-0 whitespace-nowrap overflow-hidden **:[[contenteditable]]:outline-none **:[[contenteditable]]:p-0 **:[[contenteditable]]:whitespace-nowrap **:[[contenteditable]]:min-h-lh [&_p]:my-0 [&_p]:whitespace-nowrap"
        >
          <MarkdownShell
            config={editor}
            placeholder={props.placeholder ?? 'Search'}
            autofocus={props.autoFocus}
            initialValue={initialEditorValue}
            class="min-h-0! overflow-visible!"
          />
        </div>
        <Show when={!hasContent() && !props.onDismiss}>
          <div class="shrink-0 text-xxs text-ink-extra-muted rounded-sm border border-ink/5 px-1.5 py-px group-focus-within:hidden">
            <Hotkey shortcut="cmd+f" class="flex gap-1" />
          </div>
        </Show>
        <Show when={hasContent() || props.onDismiss}>
          <button
            type="button"
            class="ml-auto size-4 mobile:size-6 shrink-0 hover:opacity-60"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              editor.controls.clear();
              collection.setState('search', '');
              setHasContent(false);
              props.onDismiss?.();
            }}
          >
            <XIcon class="size-4 mobile:size-6" />
          </button>
        </Show>
      </div>
    </div>
  );
}
