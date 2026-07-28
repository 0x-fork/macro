import type { MenuOperations } from '@core/component/LexicalMarkdown/shared/inlineMenu';
import { mergeRegister } from '@lexical/utils';
import {
  $collapseInlineSearch,
  $createDocumentMentionNode,
  $createInlineSearchNode,
  $handleInlineSearchNodeMutation,
  $handleInlineSearchNodeTransform,
  $removeInlineSearch,
  InlineSearchNode,
  InlineSearchNodesType,
  validTriggerPosition,
} from '@macro-inc/lexical-core';
import {
  $insertNodes,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  createCommand,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
} from 'lexical';

const TYPE_SKILL_SLASH_COMMAND: LexicalCommand<void> = createCommand(
  'TYPE_SKILL_SLASH_COMMAND'
);

export const CLOSE_SKILL_SEARCH_COMMAND: LexicalCommand<void> = createCommand(
  'CLOSE_SKILL_SEARCH_COMMAND'
);

export const INSERT_SKILL_MENTION_COMMAND: LexicalCommand<{
  documentId: string;
  documentName: string;
}> = createCommand('INSERT_SKILL_MENTION_COMMAND');

// Validators for the position of the / trigger — same rule as the block
// editor's actions menu (only trigger at a word boundary).
const beforeRegex = /\s$/;
const afterRegex = /^\s/;

type SkillSlashPluginProps = {
  menu: MenuOperations;
};

/**
 * Registers a `/<skillname>` slash command in the AI chat input, structurally
 * mirroring the block editor's `actionsPlugin` (also triggered by `/`) —
 * safe to reuse the same trigger character here since the chat editor never
 * registers the block-actions plugin. Selecting a skill inserts a
 * `DocumentMentionNode` tagged `blockName: 'skill'`; deleting that node
 * un-attaches it (see the `onRemove` wiring in `Chat.tsx`).
 */
function registerSkillSlashPlugin(
  editor: LexicalEditor,
  props: SkillSlashPluginProps
) {
  if (!editor.hasNodes([InlineSearchNode])) {
    throw new Error(
      'skillSlashPlugin: editor config is missing required nodes.'
    );
  }

  const { menu } = props;

  function registerSymbolListener() {
    const listener = (e: KeyboardEvent) => {
      if (e.key === '/') {
        editor.dispatchCommand(TYPE_SKILL_SLASH_COMMAND, undefined);
      }
    };

    return editor.registerRootListener((root, prev) => {
      if (root) {
        root.addEventListener('keydown', listener);
      }
      if (prev) {
        prev.removeEventListener('keydown', listener);
      }
    });
  }

  return mergeRegister(
    registerSymbolListener(),

    editor.registerCommand(
      TYPE_SKILL_SLASH_COMMAND,
      () => {
        const shouldTrigger = validTriggerPosition(
          editor,
          beforeRegex,
          afterRegex
        );
        if (shouldTrigger) {
          editor.update(() => {
            $insertNodes([$createInlineSearchNode('/')]);
          });
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_LOW
    ),

    editor.registerCommand(
      CLOSE_SKILL_SEARCH_COMMAND,
      () => $collapseInlineSearch(),
      COMMAND_PRIORITY_LOW
    ),

    editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => $collapseInlineSearch(),
      COMMAND_PRIORITY_HIGH
    ),

    editor.registerCommand(
      INSERT_SKILL_MENTION_COMMAND,
      ({ documentId, documentName }) => {
        $removeInlineSearch();
        $insertNodes([
          $createDocumentMentionNode({
            documentId,
            documentName,
            blockName: 'skill',
          }),
        ]);
        return true;
      },
      COMMAND_PRIORITY_LOW
    ),

    // Menu ENTERs should not propagate to the editor.
    editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => menu.isOpen(),
      COMMAND_PRIORITY_CRITICAL
    ),

    editor.registerNodeTransform(InlineSearchNode, (node: InlineSearchNode) =>
      $handleInlineSearchNodeTransform(node, InlineSearchNodesType.Actions)
    ),

    editor.registerMutationListener(
      InlineSearchNode,
      (mutatedNodes, { prevEditorState }) =>
        $handleInlineSearchNodeMutation(
          editor,
          prevEditorState,
          mutatedNodes,
          InlineSearchNodesType.Actions,
          {
            onDestroy: () => menu.closeMenu(),
            onCreate: () => menu.openMenu(),
            onUpdate: (search) => menu.setSearchTerm(search),
          }
        )
    )
  );
}

export function skillSlashPlugin(props: SkillSlashPluginProps) {
  return (editor: LexicalEditor) => registerSkillSlashPlugin(editor, props);
}
