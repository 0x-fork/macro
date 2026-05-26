import { createSignal } from 'solid-js';
import { Button } from '@ui';
import { MobileDrawer } from '@app/component/mobile/MobileDrawer';
import PlusIcon from '@phosphor/plus.svg';
import PaperclipIcon from '@phosphor-icons/core/regular/paperclip.svg?component-solid';
import FormatIcon from '@phosphor/text-aa.svg';
import { useInput, useInputCommands } from './context';
import { CHANNEL_FILE_PICKER_ACCEPT } from './accepted-file-types';
import type { JSX } from 'solid-js';

export function MobileActionsMenu() {
  const input = useInput();
  const commands = useInputCommands();
  const [open, setOpen] = createSignal(false);
  let fileInputRef: HTMLInputElement | undefined;

  const onAttachFiles: JSX.EventHandlerUnion<HTMLInputElement, Event> = (
    event
  ) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) return;
    void commands.attachFiles(files);
  };

  const handleAttach = () => {
    setOpen(false);
    fileInputRef?.click();
  };

  const handleFormat = () => {
    setOpen(false);
    commands.toggleFormatRibbon();
  };

  return (
    <>
      <input
        ref={(element) => {
          fileInputRef = element;
        }}
        type="file"
        class="hidden"
        multiple
        accept={CHANNEL_FILE_PICKER_ACCEPT}
        onChange={onAttachFiles}
        data-input-attach-file-picker
      />
      <MobileDrawer open={open()} onOpenChange={setOpen}>
        <MobileDrawer.Trigger
          as={Button}
          size="icon-sm"
          title="More actions"
          aria-label="More actions"
        >
          <PlusIcon class="size-5" />
        </MobileDrawer.Trigger>
        <MobileDrawer.Portal>
          <MobileDrawer.Overlay class="fixed inset-0 z-modal-overlay bg-modal-overlay" />
          <MobileDrawer.Content>
            <MobileDrawer.Handle />
            <MobileDrawer.Section class="mb-3">
              <button
                type="button"
                class="flex items-center gap-3 px-4 py-3 w-full text-left bg-surface active:bg-ink/10"
                onClick={handleAttach}
              >
                <PaperclipIcon class="size-5 text-ink-muted" />
                <span class="text-base">Attach files</span>
              </button>
              <div class="h-px bg-edge-muted ml-12" />
              <button
                type="button"
                class="flex items-center gap-3 px-4 py-3 w-full text-left bg-surface active:bg-ink/10"
                classList={{ 'bg-active': input().showFormatRibbon }}
                onClick={handleFormat}
              >
                <FormatIcon class="size-5 text-ink-muted" />
                <span class="text-base">Format</span>
              </button>
            </MobileDrawer.Section>
          </MobileDrawer.Content>
        </MobileDrawer.Portal>
      </MobileDrawer>
    </>
  );
}
