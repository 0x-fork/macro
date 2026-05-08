import { Panel } from '@ui/components/Panel';
import { MarkdownShell } from '@core/component/LexicalMarkdown/builder/MarkdownShell';
import { isMobile } from '@core/mobile/isMobile';
import { isIOS } from '@solid-primitives/platform';
import { Input } from './Input';
import { FormatButtons } from './FormatButtons';
import { createConfiguredChannelMarkdownEditor } from './configured-markdown-editor';
import { createInputAttachmentTracker } from './attachment-tracker';
import { createInputState } from './create-input-state';
import { createMentionsTracker } from './mentions-tracker';
import { createTypingTracker } from './create-typing-tracker';
import {
  chatRuleset,
  handleFileFolderDrop,
  uploadFile,
} from '@core/util/upload';
import { uploadInputAttachments } from './upload-attachments';
import type {
  InputAttachmentTracker,
  InputCallbacks,
  InputData,
  InputHandle,
  InputPersistenceKey,
} from './types';
import { applyInlineFormat, applyNodeFormat } from './utils/formatting';
import {
  Show,
  createSignal,
  type Accessor,
  type JSX,
} from 'solid-js';
import { isReplyInput } from './types';
import type { IUser } from '@core/user/types';
import { registerHotkey, useHotkeyDOMScope } from '@core/hotkey/hotkeys';
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

  const markdownEditor = createConfiguredChannelMarkdownEditor({
    namespace: props.markdownNamespace ?? 'channel-input-markdown',
    enableMentions: true,
    users: props.participants,
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

  props.onReady?.({
    clear: () => markdownEditor.controls.clear(),
    focus: () => markdownEditor.controls.focus(),
    attachFiles: (files) => inputState.commands.attachFiles(files),
    restoreSnapshot: (snapshot) => {
      markdownEditor.controls.setMarkdown(snapshot.value);
      attachmentTracker.setAttachments(snapshot.attachments);
      mentionsTracker.setMentions(snapshot.mentions);
      markdownEditor.controls.focus();
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

  return (
    <Input.Root input={inputState.view()} commands={inputState.commands}>
      <Panel depth={2}>
        <Input.DropZone
          onDragStart={(valid) => inputState.setIsDraggedOver(valid)}
          onDragEnd={() => inputState.setIsDraggedOver(false)}
        >
          <div class="flex flex-col w-full">
            <Input.DropOverlay />
            <Show when={isReplyInput(inputState.view())}>
              <div class="flex items-center justify-between px-3 py-0.5 bg-ink/5 border-b border-edge-muted">
                <div class="flex items-center gap-1 text-ink-muted">
                  <ReplyIcon class="size-3" />
                  <span class="text-xxs">Replying to thread</span>
                </div>
                <button
                  type="button"
                  class="size-5 flex items-center justify-center rounded-sm text-ink-muted hover:text-ink hover:bg-ink/10"
                  onClick={() => inputState.commands.close()}
                >
                  <svg class="size-3" viewBox="0 0 256 256" fill="currentColor">
                    <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
                  </svg>
                </button>
              </div>
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
              <div class="shrink-0 mobile:hidden">
                <Input.AttachFilesAction />
              </div>
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
                  />
                </Input.Editor>
              </div>
              <div class="shrink-0 hidden mobile:block">
                <MobileActionsMenu />
              </div>
              <div class="shrink-0 mobile:hidden">
                <Input.ToggleFormatAction />
              </div>
              <div class="shrink-0">
                <Input.SendAction />
              </div>
            </div>
            <Input.Attachments kind="media" />
            <Input.Attachments kind="document" />
          </div>
        </Input.DropZone>
      </Panel>
    </Input.Root>
  );
}
