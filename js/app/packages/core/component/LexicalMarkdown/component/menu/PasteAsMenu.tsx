import { ScopedPortal } from '@core/component/ScopedPortal';
import clickOutside from '@core/directive/clickOutside';
import { $createLinkNode } from '@lexical/link';
import {
  $createEmbedNode,
  $isLinkMentionNode,
  type EmbedProvider,
} from '@lexical-core';
import AtIcon from '@phosphor/at.svg';
import FigmaIcon from '@phosphor/figma-logo.svg';
import LinkIcon from '@phosphor/link.svg';
import XLogoIcon from '@phosphor/x-logo.svg';
import YouTubeIcon from '@phosphor/youtube-logo.svg';
import { cn, Surface } from '@ui';
import {
  $createNodeSelection,
  $createTextNode,
  $getNodeByKey,
  $setSelection,
  type LexicalEditor,
} from 'lexical';
import {
  type Accessor,
  type Component,
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { floatWithElement } from '../../directive/floatWithElement';
import type { EmbedPasteInfo } from '../../plugins/embed';
import { useMenuKeyboardNavigation } from './useMenuKeyboardNavigation';

false && clickOutside;
false && floatWithElement;

export type PasteAsMenuState = EmbedPasteInfo | null;

type PasteAsMenuProps = {
  editor: LexicalEditor;
  state: Accessor<PasteAsMenuState>;
  setState: (state: PasteAsMenuState) => void;
};

type PasteAsOption = {
  id: 'mention' | 'url' | 'embed';
  label: string;
  icon: Component<{ class?: string }>;
};

const EMBED_OPTIONS: Record<
  EmbedProvider,
  { label: string; icon: Component<{ class?: string }> }
> = {
  x: { label: 'Embed post', icon: XLogoIcon },
  youtube: { label: 'Embed video', icon: YouTubeIcon },
  figma: { label: 'Embed design', icon: FigmaIcon },
};

/**
 * "Paste as" menu shown after pasting an embeddable link. The link is pasted
 * as a mention by default; this menu offers to switch it to a plain url or a
 * full embed. Escape (or clicking/typing elsewhere) keeps the mention.
 */
export function PasteAsMenu(props: PasteAsMenuProps) {
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const options = (): PasteAsOption[] => {
    const provider = props.state()?.provider;
    const embed = provider ? EMBED_OPTIONS[provider] : undefined;
    return [
      { id: 'mention', label: 'Mention', icon: AtIcon },
      { id: 'url', label: 'URL', icon: LinkIcon },
      {
        id: 'embed',
        label: embed?.label ?? 'Embed',
        icon: embed?.icon ?? LinkIcon,
      },
    ];
  };

  const close = () => {
    props.setState(null);
  };

  createEffect(() => {
    if (props.state()) setSelectedIndex(0);
  });

  // Close if the pasted mention disappears (e.g. undo).
  createEffect(() => {
    const state = props.state();
    if (!state) return;
    const cleanup = props.editor.registerUpdateListener(({ editorState }) => {
      const exists = editorState.read(
        () => $getNodeByKey(state.nodeKey) !== null
      );
      if (!exists) close();
    });
    onCleanup(cleanup);
  });

  const anchorElement = () => {
    const state = props.state();
    if (!state) return undefined;
    return props.editor.getElementByKey(state.nodeKey) ?? undefined;
  };

  const apply = (id: PasteAsOption['id']) => {
    const state = props.state();
    if (!state) return;

    if (id === 'url') {
      props.editor.update(() => {
        const node = $getNodeByKey(state.nodeKey);
        if (!$isLinkMentionNode(node)) return;
        const linkNode = $createLinkNode(state.url);
        linkNode.append($createTextNode(state.url));
        node.replace(linkNode);
        linkNode.selectEnd();
      });
    }

    if (id === 'embed') {
      props.editor.update(() => {
        const node = $getNodeByKey(state.nodeKey);
        if (!$isLinkMentionNode(node)) return;
        const embedNode = $createEmbedNode({
          provider: state.provider,
          url: state.url,
        });
        const block = node.getTopLevelElement();
        const blockOnlyHoldsMention =
          block?.getTextContent().trim() === node.getTextContent().trim();
        if (block && blockOnlyHoldsMention) {
          block.replace(embedNode);
        } else {
          node.remove();
          block?.insertAfter(embedNode);
        }
        const selection = $createNodeSelection();
        selection.add(embedNode.getKey());
        $setSelection(selection);
      });
    }

    close();
  };

  useMenuKeyboardNavigation({
    isActive: () => props.state() !== null,
    onUp: () => {
      setSelectedIndex(
        (selectedIndex() - 1 + options().length) % options().length
      );
    },
    onDown: () => {
      setSelectedIndex((selectedIndex() + 1) % options().length);
    },
    onSelect: () => {
      apply(options()[selectedIndex()].id);
    },
    onClose: close,
    onOtherKey: close,
  });

  return (
    <Show when={props.state()}>
      <ScopedPortal>
        <div
          class="cursor-default select-none w-44 z-modal-content menu-open-animation absolute"
          use:floatWithElement={{
            element: anchorElement,
            spacing: 6,
          }}
          use:clickOutside={close}
          on:touchstart={(e) => e.stopPropagation()}
        >
          <Surface
            depth={2}
            class="py-1.5 shadow-lg shadow-drop-shadow rounded-xl"
          >
            <div class="flex flex-col px-1.5 w-full">
              <div class="px-1.5 py-1 text-xs text-ink-muted">Paste as</div>
              <For each={options()}>
                {(option, index) => (
                  <div
                    class={cn(
                      'group flex items-center px-1.5 py-1 rounded-md',
                      {
                        'bg-ink/5': selectedIndex() === index(),
                      }
                    )}
                    on:mouseover={() => setSelectedIndex(index())}
                    on:mouseup={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    on:mousedown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    on:click={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      apply(option.id);
                    }}
                  >
                    <p class="flex flex-row gap-2 items-center w-full">
                      <Dynamic
                        component={option.icon}
                        class="size-4 shrink-0 text-ink-muted"
                      />
                      <span class="text-ink text-sm grow overflow-hidden text-nowrap truncate">
                        {option.label}
                      </span>
                    </p>
                  </div>
                )}
              </For>
            </div>
          </Surface>
        </div>
      </ScopedPortal>
    </Show>
  );
}
