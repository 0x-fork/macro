import { MarkdownShell } from '@core/component/LexicalMarkdown/builder/MarkdownShell';
import { DragInsertIndicator } from '@core/component/LexicalMarkdown/component/misc/DragInsertIndicator';
import {
  createDragInsertStore,
  INSERT_DOCUMENT_MENTION_COMMAND,
} from '@core/component/LexicalMarkdown/plugins';
import {
  clearDragInsertPreview,
  insertDocumentMentionAtDragCoordinates,
  updateDragInsertPreviewFromCoordinates,
} from '@core/component/LexicalMarkdown/utils/dragInsertUtils';
import { registerHotkey, useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { isMobile } from '@core/mobile/isMobile';
import type { IUser } from '@core/user/types';
import {
  chatRuleset,
  handleFileFolderDrop,
  uploadFile,
} from '@core/util/upload';
import type { EntityData } from '@entity';
import { isIOS } from '@solid-primitives/platform';
import { Surface } from '@ui';
import { $getRoot } from 'lexical';
import { type Accessor, createSignal, type JSX, Show } from 'solid-js';
import { MACRO_AI_BOT_ID, macroAiMentionUser } from '../macroAi';
import { createInputAttachmentTracker } from './attachment-tracker';
import { createConfiguredChannelMarkdownEditor } from './configured-markdown-editor';
import { createInputState } from './create-input-state';
import { createTypingTracker } from './create-typing-tracker';
import { FormatButtons } from './FormatButtons';
import { Input } from './Input';
import { createMentionsTracker } from './mentions-tracker';
import type {
  EntityMentionInsertCoordinates,
  InputAttachmentTracker,
  InputCallbacks,
  InputData,
  InputHandle,
  InputPersistenceKey,
} from './types';
import { isReplyInput } from './types';
import { uploadInputAttachments } from './upload-attachments';
import { entityToDocumentMentionInfo } from './utils/entity-mention';
import { applyInlineFormat, applyNodeFormat } from './utils/formatting';
import ReplyIcon from '@phosphor-icons/core/regular/arrow-bend-up-left.svg?component-solid';
import { MobileActionsMenu } from './MobileActionsMenu';

export type ChannelInputProps = InputCallbacks & {
  input: InputData;
  markdownNamespace?: string;
  persistenceKey?: InputPersistenceKey;
  attachmentTracker?: InputAttachmentTracker;
  participants?: Accessor<IUser[]>;
  onReady?: (handle: InputHandle) => void;
  /** Whether to auto-focus the input on mount. Defaults to `!isMobile()`. */
  autofocus?: boolean;
  /**
   * Custom action bar rendered in place of the default inline actions
   * (used e.g. by the inline message editor for save/discard controls).
   */
  children?: JSX.Element;
};

export function ChannelInput(props: ChannelInputProps) {
  const [scrollContainer, setScrollContainer] = createSignal<HTMLElement>();
  const mentionsTracker = createMentionsTracker();
  const attachmentTracker =
    props.attachmentTracker ??
    createInputAttachmentTracker({
      initialAttachments: props.input.attachments,
    });
  let clearComposer = () => {};

  const typingTracker = createTypingTracker({
    onStartTyping: () => props.onStartTyping?.(),
    onStopTyping: () => props.onStopTyping?.(),
  });

  const inputState = createInputState({
    initialInput: props.input,
    mentions: mentionsTracker.mentions,
    attachmentTracker,
    clearComposer: () => clearComposer(),
    attachFiles: async (files) => {
      await uploadInputAttachments({
        files,
        tracker: attachmentTracker,
        uploadFile: async (file) => {
          return uploadFile(file, chatRuleset, {
            hideProgressIndicator: true,
          });
        },
      });
    },
    clearInput: () => markdownEditor.controls.clear(),
    callbacks: {
      onChange: props.onChange,
      onSend: (snapshot) => {
        typingTracker.stop();
        return props.onSend?.(snapshot);
      },
      onToggleFormatRibbon: props.onToggleFormatRibbon,
      onClose: (snapshot) => {
        typingTracker.stop();
        return props.onClose?.(snapshot);
      },
      onRemoveAttachment: props.onRemoveAttachment,
    },
    persistenceKey: props.persistenceKey,
  });

  let isEditorConnected = false;
  let pendingRestoreSnapshot:
    | Parameters<InputHandle['restoreSnapshot']>[0]
    | undefined;

  const applySnapshot = (
    snapshot: Parameters<InputHandle['restoreSnapshot']>[0]
  ) => {
    markdownEditor.controls.setMarkdown(snapshot.value);
    attachmentTracker.setAttachments(snapshot.attachments);
    mentionsTracker.setMentions(snapshot.mentions);
    markdownEditor.controls.focus();
  };

  const flushPendingRestore = () => {
    const snapshot = pendingRestoreSnapshot;
    pendingRestoreSnapshot = undefined;
    if (!snapshot) return;
    queueMicrotask(() => applySnapshot(snapshot));
  };

  // Macro AI is mentionable in every channel. It is surfaced through the same
  // `@`-mention typeahead as participants and re-tagged as a bot at send time.
  const mentionUsers: Accessor<IUser[]> = () => {
    const base = props.participants?.() ?? [];
    return base.some((user) => user.id === MACRO_AI_BOT_ID)
      ? base
      : [macroAiMentionUser(), ...base];
  };

  const markdownEditor = createConfiguredChannelMarkdownEditor({
    namespace: props.markdownNamespace ?? 'channel-input-markdown',
    enableMentions: true,
    users: mentionUsers,
    scrollContainer,
    onMentionCreate: (mention) => {
      mentionsTracker.onMentionCreate(mention);
    },
    onMentionRemove: (mention) => {
      mentionsTracker.onMentionRemove(mention);
    },
    onChange: (markdown) => {
      inputState.setValue(markdown);
      typingTracker.keystroke();
    },
    onEnter: () => {
      if (isMobile()) return false;
      typingTracker.stop();
      inputState.commands.send();
      return true;
    },
    onPasteFilesAndDirs: (files, directories) => {
      void handleFileFolderDrop(files, directories, (entries) =>
        inputState.commands.attachFiles(entries.map((entry) => entry.file))
      );
    },
    onAttachFromDisk: (files) => inputState.commands.attachFiles(files),
  });
  const markdownHandle = markdownEditor.buildHandle();
  const lexicalEditor = () => markdownHandle.lexical;
  const [entityDragInsertStore, setEntityDragInsertStore] =
    createDragInsertStore();

  const isInsideEditorDropBounds = (
    coordinates: EntityMentionInsertCoordinates
  ) => {
    const rect =
      scrollContainer()?.getBoundingClientRect() ??
      lexicalEditor().getRootElement()?.getBoundingClientRect();
    if (!rect) return false;
    return (
      coordinates.clientX >= rect.left &&
      coordinates.clientX <= rect.right &&
      coordinates.clientY >= rect.top &&
      coordinates.clientY <= rect.bottom
    );
  };
  // On iOS, blur before clearing so dictation finalizes and discards its buffer
  // (otherwise it re-injects the sent text into the cleared editor). Re-focus
  // via rAF so the keyboard stays up: rAF fires after Lexical's update commits,
  // avoiding a conflict where clear()'s $setSelection(null) undoes the focus.
  clearComposer = () => {
    if (isIOS) {
      markdownEditor.controls.blur();
      markdownEditor.controls.clear();
      requestAnimationFrame(() => markdownEditor.controls.focus());
    } else {
      markdownEditor.controls.clear();
    }
  };

  const previewEntityMentionInsertion = (
    coordinates: EntityMentionInsertCoordinates
  ) => {
    updateDragInsertPreviewFromCoordinates({
      editor: lexicalEditor(),
      coordinates,
      setState: setEntityDragInsertStore,
      isValidDropTarget: isInsideEditorDropBounds,
    });
  };

  const clearEntityMentionInsertionPreview = () => {
    clearDragInsertPreview(setEntityDragInsertStore);
  };

  // Insert a mention for an entity dragged in from the soup. When the drop
  // happens over editor content, mirror markdown documents by inserting before
  // or after the nearest top-level node; otherwise keep the old append fallback.
  const insertEntityMention = (
    entity: EntityData,
    coordinates?: EntityMentionInsertCoordinates
  ) => {
    clearEntityMentionInsertionPreview();
    const mentionInfo = entityToDocumentMentionInfo(entity);
    if (!mentionInfo) return;

    if (
      !insertDocumentMentionAtDragCoordinates({
        editor: lexicalEditor(),
        coordinates,
        mentionInfo,
        isValidDropTarget: isInsideEditorDropBounds,
      })
    ) {
      const editor = lexicalEditor();
      editor.update(() => {
        $getRoot().selectEnd();
      });
      editor.dispatchCommand(INSERT_DOCUMENT_MENTION_COMMAND, mentionInfo);
    }
    markdownEditor.controls.focus();
  };

  props.onReady?.({
    clear: () => markdownEditor.controls.clear(),
    focus: () => markdownEditor.controls.focus(),
    attachFiles: (files) => inputState.commands.attachFiles(files),
    insertEntityMention,
    previewEntityMentionInsertion,
    clearEntityMentionInsertionPreview,
    restoreSnapshot: (snapshot) => {
      if (!isEditorConnected) {
        pendingRestoreSnapshot = snapshot;
        return;
      }
      applySnapshot(snapshot);
    },
  });

  const [attach, scopeId] = useHotkeyDOMScope('channel-input-intercept');
  registerHotkey({
    scopeId,
    description: 'block escape from moving up scope',
    hotkey: ['escape'],
    runWithInputFocused: true,
    hide: true,
    keyDownHandler: () => {
      // Block upstream escape handlers when ESC should close inline menus.
      return markdownEditor.controls.isInlineMenuOpen();
    },
  });

  const [isFocused, setIsFocused] = createSignal(false);
  const replyInputView = () => {
    const input = inputState.view();
    return isReplyInput(input) ? input : undefined;
  };

  return (
    <Input.Root input={inputState.view()} commands={inputState.commands}>
      <Surface
        onFocusOut={(e) => {
          const next = e.relatedTarget as Node | null;
          if (next && e.currentTarget.contains(next)) return;
          setIsFocused(false);
        }}
        onFocusIn={() => setIsFocused(true)}
        active={isFocused()}
        class="rounded-xl"
        depth={2}
        solid
      >
        <Input.DropZone
          onDragStart={(valid) => inputState.setIsDraggedOver(valid)}
          onDragEnd={() => inputState.setIsDraggedOver(false)}
        >
          <Input.Layout>
            <Input.DropOverlay />
            <Show when={replyInputView()}>
              {(input) => (
                <div class="flex items-center justify-between gap-2 px-3 py-1.5 bg-ink/5 border-b border-edge-muted min-w-0">
                  <button
                    type="button"
                    class="group flex items-start gap-1.5 min-w-0 text-left rounded-sm hover:underline underline-offset-2 hover:decoration-accent"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => input().replyTo?.onClick?.(event)}
                  >
                    <ReplyIcon class="size-3 shrink-0 text-ink-muted group-hover:text-accent mt-0.5" />
                    <span class="text-xxs text-ink-muted group-hover:text-accent truncate min-w-0">
                      Replying to{' '}
                      <span class="font-medium text-ink/75 group-hover:text-accent">
                        {input().replyTo?.displayName}
                      </span>
                      <span class="text-ink-extra-muted group-hover:text-accent">
                        {' '}
                        · {input().replyTo?.text}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    class="size-5 flex items-center justify-center rounded-sm text-ink-muted hover:text-ink hover:bg-ink/10 shrink-0"
                    onClick={() => inputState.commands.close()}
                  >
                    <svg class="size-3" viewBox="0 0 256 256" fill="currentColor">
                      <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
                    </svg>
                  </button>
                </div>
              )}
            </Show>
            <Input.FormatRibbon>
              <FormatButtons
                selectionState={() => markdownEditor.selection}
                onInlineFormat={(format) =>
                  applyInlineFormat(markdownEditor.lexical, format)
                }
                onNodeFormat={(format) =>
                  applyNodeFormat(markdownEditor.lexical, format)
                }
              />
            </Input.FormatRibbon>
            <div class="flex flex-row items-end gap-1 px-2 py-1.5">
              <Show when={!props.children}>
                <div class="shrink-0 mobile:hidden">
                  <Input.AttachFilesAction />
                </div>
              </Show>
              <div
                ref={setScrollContainer}
                class="flex-1 min-w-0 max-h-32 overflow-y-auto self-center"
                onClick={(event) => {
                  if (!isMobile()) {
                    event.stopPropagation();
                    markdownEditor.controls.focus();
                  }
                }}
              >
                <Input.Editor>
                  <MarkdownShell
                    config={markdownEditor}
                    placeholder={inputState.view().placeholder}
                    initialValue={inputState.view().value}
                    autofocus={!isMobile() && (props.autofocus ?? true)}
                    class="text-sm mobile:text-xs"
                    refFn={attach}
                    onConnect={() => {
                      isEditorConnected = true;
                      flushPendingRestore();
                    }}
                  />
                  <DragInsertIndicator
                    editor={lexicalEditor()}
                    state={entityDragInsertStore}
                    active
                  />
                </Input.Editor>
              </div>
              <Show when={!props.children}>
                <div class="shrink-0 hidden mobile:block">
                  <MobileActionsMenu />
                </div>
                <div class="shrink-0 mobile:hidden">
                  <Input.ToggleFormatAction />
                </div>
                <div class="shrink-0">
                  <Input.SendAction />
                </div>
              </Show>
            </div>
            <Show when={props.children}>{props.children}</Show>
            <Input.Attachments kind="media" />
            <Input.Attachments kind="document" />
          </Input.Layout>
        </Input.DropZone>
      </Surface>
    </Input.Root>
  );
}
