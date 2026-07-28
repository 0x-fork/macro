import { useChatSkillHistory } from '@core/component/AI/signal/attachment';
import { EntityIcon } from '@core/component/EntityIcon';
import { useMenuKeyboardNavigation } from '@core/component/LexicalMarkdown/component/menu/useMenuKeyboardNavigation';
import { floatWithSelection } from '@core/component/LexicalMarkdown/directive/floatWithSelection';
import type { MenuOperations } from '@core/component/LexicalMarkdown/shared/inlineMenu';
import { OldMenu, OldMenuItem } from '@core/component/OldMenu';
import clickOutside from '@core/directive/clickOutside';
import { debouncedDependent } from '@core/util/debounce';
import { fuzzyFilter } from '@core/util/fuzzy';
import { getItemBlockName } from '@core/util/getItemBlockName';
import type { HistoryItem } from '@queries/history/history';
import type { LexicalEditor } from 'lexical';
import { createEffect, createSignal, For, Show, untrack } from 'solid-js';
import {
  CLOSE_SKILL_SEARCH_COMMAND,
  INSERT_SKILL_MENTION_COMMAND,
} from './skillSlashPlugin';

false && clickOutside;
false && floatWithSelection;

type SkillSlashMenuProps = {
  editor: LexicalEditor;
  menu: MenuOperations;
};

/**
 * Typeahead menu opened by typing `/` in the AI chat input. Lists the user's
 * skill documents; selecting one attaches it (tracked separately from
 * regular attachments — see `Chat.tsx`'s mention `onCreate`/`onRemove`).
 */
export function SkillSlashMenu(props: SkillSlashMenuProps) {
  const skillHistory = useChatSkillHistory();

  const searchTerm = debouncedDependent(props.menu.searchTerm, 60);
  const activeSearchTerm = () => (props.menu.isOpen() ? searchTerm() : '');

  const filteredSkills = () =>
    fuzzyFilter(activeSearchTerm(), skillHistory(), (item) => item.name);

  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [mountSelection, setMountSelection] = createSignal<Selection | null>();

  const [menuOpen, setMenuOpen] = [props.menu.isOpen, props.menu.setIsOpen];

  createEffect(() => {
    if (menuOpen()) {
      setMountSelection(document.getSelection());
      setSelectedIndex(0);
    } else {
      setMountSelection(null);
    }
  });

  createEffect(() => {
    searchTerm();
    setSelectedIndex(0);
  });

  createEffect(() => {
    const count = filteredSkills().length;
    if (count > 0 && selectedIndex() >= count) {
      setSelectedIndex(count - 1);
    }
  });

  const closeMenu = () => {
    props.editor.dispatchCommand(CLOSE_SKILL_SEARCH_COMMAND, undefined);
    setMenuOpen(false);
  };

  const selectItem = (item: HistoryItem) => {
    props.editor.dispatchCommand(INSERT_SKILL_MENTION_COMMAND, {
      documentId: item.id,
      documentName: item.name,
    });
  };

  useMenuKeyboardNavigation({
    isActive: menuOpen,
    onUp: () => {
      const items = filteredSkills();
      if (items.length === 0) return;
      setSelectedIndex((selectedIndex() - 1 + items.length) % items.length);
    },
    onDown: () => {
      const items = filteredSkills();
      if (items.length === 0) return;
      setSelectedIndex((selectedIndex() + 1) % items.length);
    },
    onSelect: () => {
      const selectedItem = filteredSkills()[selectedIndex()];
      if (selectedItem) {
        selectItem(selectedItem);
      } else {
        closeMenu();
      }
    },
    onClose: closeMenu,
  });

  return (
    <Show when={menuOpen()}>
      <div
        class="w-75 max-w-[calc(100cqw-1rem-2px)] cursor-default select-none z-modal-content"
        use:floatWithSelection={{
          selection: untrack(mountSelection),
          reactiveOnContainer: props.editor.getRootElement(),
        }}
        use:clickOutside={() => closeMenu()}
      >
        <OldMenu>
          <div class="px-3.5 pt-2 pb-1 text-xs font-medium text-ink-muted">
            Skills
          </div>
          <Show
            when={filteredSkills().length > 0}
            fallback={
              <div class="p-2 w-full flex-col justify-center items-center">
                <p class="text-sm text-ink-muted">
                  {activeSearchTerm() ? 'No results' : 'No skills yet'}
                </p>
              </div>
            }
          >
            <For each={filteredSkills()}>
              {(item, index) => (
                <div
                  class={index() === selectedIndex() ? 'bg-hover' : ''}
                  onMouseEnter={() => setSelectedIndex(index())}
                >
                  <OldMenuItem
                    text={item.name}
                    icon={() => (
                      <EntityIcon
                        targetType={getItemBlockName(item, true)}
                        size="xs"
                      />
                    )}
                    onClick={() => selectItem(item)}
                  />
                </div>
              )}
            </For>
          </Show>
        </OldMenu>
      </div>
    </Show>
  );
}
