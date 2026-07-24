import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { unifiedListMarkdownTheme } from '@core/component/LexicalMarkdown/theme';
import { blockNameToDefaultFile } from '@core/constant/allBlocks';
import { formatDocumentName } from '@service-storage/util/filename';
import { createElementSize } from '@solid-primitives/resize-observer';
import { Tooltip } from '@ui';
import {
  type Accessor,
  createEffect,
  createSignal,
  type JSX,
  Show,
} from 'solid-js';
import { match } from 'ts-pattern';
import { type EntityData, isGithubPrEntity } from '../types/entity';
import { isSearchEntity } from '../types/search';

function extractRawTitle(entity: EntityData): JSX.Element {
  return match<EntityData, JSX.Element>(entity)
    .with({ type: 'document' }, (e) =>
      formatDocumentName(e.name, e.fileType, {
        fullyQualifiedBlockName: true,
      })
    )
    .with({ type: 'project' }, (e) => e.name)
    .with({ type: 'channel' }, (e) => e.name)
    .with({ type: 'channel_message' }, (e) => e.channelName)
    .with({ type: 'channel_thread' }, (e) => e.name)
    .with({ type: 'email' }, (e) => e.name || '(No Subject)')
    .with({ type: 'chat' }, (e) => e.name)
    .with({ type: 'call' }, (e) => e.name || blockNameToDefaultFile('call'))
    .with(
      { type: 'automation' },
      (e) => e.name || blockNameToDefaultFile('automation')
    )
    .when(isGithubPrEntity, (e) => (
      <>
        {e.metadata.name}{' '}
        <span class="text-ink-extra-muted font-normal">
          #{e.metadata.number}
        </span>
      </>
    ))
    .with({ type: 'foreign' }, (e) => e.name)
    .with({ type: 'crm_company' }, (e) => e.name || 'Unknown Company')
    .with(
      { type: 'crm_contact' },
      (e) => e.name || e.email || 'Unknown Contact'
    )
    .otherwise(() => 'Unknown');
}

function extractSearchHighlight(entity: EntityData): string | undefined {
  if (!isSearchEntity(entity)) return undefined;
  return entity.search.nameHighlight ?? undefined;
}

/**
 * Tracks whether the rendered element's text is visually clipped
 * (`scrollWidth` exceeds `clientWidth`), re-checking whenever the element's
 * own box size changes.
 */
function useIsTruncated(ref: Accessor<HTMLElement | undefined>) {
  const size = createElementSize(ref);
  const [truncated, setTruncated] = createSignal(false);

  createEffect(() => {
    // Track size so we re-measure whenever the element (or its container)
    // resizes.
    void size.width;
    void size.height;
    const el = ref();
    setTruncated(!!el && el.scrollWidth > el.clientWidth);
  });

  return truncated;
}

export function EntityTitle(props: { entity: EntityData }) {
  const titleData = () => {
    const searchHighlight = extractSearchHighlight(props.entity);
    if (searchHighlight) {
      return {
        text: searchHighlight,
        isMarkdown: true,
      };
    }

    return {
      text: extractRawTitle(props.entity),
      isMarkdown: false,
    };
  };

  const [titleRef, setTitleRef] = createSignal<HTMLElement>();
  const isTruncated = useIsTruncated(titleRef);
  // The tooltip re-uses the rendered element's own text, so it stays correct
  // for markdown/highlighted titles without re-deriving a plain-text label.
  const tooltipLabel = () => titleRef()?.textContent?.trim() ?? '';

  return (
    <Tooltip
      as="span"
      class="min-w-0 truncate"
      label={tooltipLabel()}
      disabled={!isTruncated()}
    >
      <Show
        when={titleData().isMarkdown}
        fallback={
          <span ref={setTitleRef} class="truncate">
            {titleData().text}
          </span>
        }
      >
        <StaticMarkdown
          markdown={titleData().text as string}
          theme={unifiedListMarkdownTheme}
          singleLine={true}
          rootRef={setTitleRef}
        />
      </Show>
    </Tooltip>
  );
}
