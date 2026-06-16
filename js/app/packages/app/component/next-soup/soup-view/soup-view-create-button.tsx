import { CREATABLE_BLOCKS, runCreateAction } from '@app/component/Launcher';
import { CollapsibleHeaderItem } from '@app/component/split-layout/components/CollapsibleHeaderItem';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { isListViewID, type ListView } from '@app/constants/list-views';
import { useHandleFileUpload } from '@app/util/handleFileUpload';
import type { BlockAlias, BlockName } from '@core/block';
import { EntityIcon } from '@core/component/EntityIcon';
import {
  handleFolderSelect,
  openFilePicker,
  openFolderPicker,
} from '@core/util/upload';
import ChevronDownIcon from '@phosphor/caret-down.svg';
import PlusIcon from '@phosphor/plus.svg';
import UploadIcon from '@phosphor/upload-simple.svg';
import { Button, Dropdown } from '@ui';
import { createMemo, For, Show } from 'solid-js';
import { NewCallButton } from './NewCallButton';

// Which blocks to show as create options per view, in order
const VIEW_CREATE_BLOCKNAMES: Partial<
  Record<ListView, (BlockName | BlockAlias)[]>
> = {
  documents: ['md', 'snippet', 'canvas', 'code'],
  tasks: ['task'],
  agents: ['chat', 'automation'],
  mail: ['email'],
  channels: ['channel'],
  folders: ['project'],
};

type CreateOption = {
  id: BlockName | BlockAlias | 'import-file' | 'import-folder';
  label: string;
};

const IMPORT_FILE_OPTION: CreateOption = {
  id: 'import-file',
  label: 'Import file',
};
const IMPORT_FOLDER_OPTION: CreateOption = {
  id: 'import-folder',
  label: 'Import folder',
};

/**
 * Fallback labels for blocks that shouldn't appear in the global launcher
 * (and thus aren't in CREATABLE_BLOCKS) but still need a create entry in
 * specific list views.
 */
const VIEW_ONLY_BLOCK_LABELS: Partial<Record<BlockName | BlockAlias, string>> =
  {
    automation: 'Automation',
  };

const VIEW_CREATE_LABELS: Partial<Record<ListView, string>> = {
  agents: 'Agent',
  channels: 'Channel',
  documents: 'New',
  folders: 'Folder',
  mail: 'Email',
  tasks: 'Task',
};

function getViewCreateOptions(view: ListView): CreateOption[] {
  const createNames = VIEW_CREATE_BLOCKNAMES[view] ?? [];
  return createNames.flatMap((name) => {
    const block = CREATABLE_BLOCKS.find((b) => b.blockName === name);
    if (block) return [{ id: block.blockName, label: block.label }];
    const viewOnlyLabel = VIEW_ONLY_BLOCK_LABELS[name];
    if (viewOnlyLabel) return [{ id: name, label: viewOnlyLabel }];
    return [];
  });
}

function getViewImportOptions(view: ListView): CreateOption[] {
  if (view === 'documents') return [IMPORT_FILE_OPTION, IMPORT_FOLDER_OPTION];
  if (view === 'folders') return [IMPORT_FOLDER_OPTION];
  return [];
}

function CreateOptionIcon(props: {
  id: BlockName | BlockAlias | 'import-file' | 'import-folder';
}) {
  return (
    <Show
      when={props.id !== 'import-file' && props.id !== 'import-folder'}
      fallback={<UploadIcon class="size-3.5" />}
    >
      <EntityIcon
        targetType={props.id as BlockName}
        size="xs"
        class="mobile:size-6"
      />
    </Show>
  );
}

export const SoupViewCreateButton = () => {
  const panel = useSplitPanelOrThrow();
  const handleFileUpload = useHandleFileUpload();

  const currentView = createMemo(() => {
    const content = panel.handle.content();
    if (content.type !== 'component') return undefined;
    return isListViewID(content.id) ? content.id : undefined;
  });

  const options = createMemo<CreateOption[]>(() => {
    const view = currentView();
    if (!view) return [];
    return getViewCreateOptions(view);
  });
  const importOptions = createMemo<CreateOption[]>(() => {
    const view = currentView();
    if (!view) return [];
    return getViewImportOptions(view);
  });
  const createLabel = createMemo(() => {
    const view = currentView();
    if (!view) return 'Create';
    return VIEW_CREATE_LABELS[view] ?? 'Create';
  });
  const primaryCreateLabel = createMemo(() => {
    const currentOptions = options();
    const option = currentOptions[0];
    if (!option) return createLabel();
    if (currentOptions.length === 1) return 'Create';
    return `Create ${option.label.toLowerCase()}`;
  });
  const primaryImportLabel = createMemo(
    () => importOptions()[0]?.label ?? 'Import'
  );

  const handleSelect = (option: CreateOption) => {
    if (option.id === 'import-file') {
      openFilePicker({ multiple: true }, async (files) => {
        await handleFileUpload(files, false);
      });
      return;
    }
    if (option.id === 'import-folder') {
      openFolderPicker({}, async (files) => {
        await handleFolderSelect(files, async (fileEntries) => {
          await handleFileUpload(fileEntries, false);
        });
      });
      return;
    }
    runCreateAction(option.id);
  };

  const actionButtonClass =
    'h-6 rounded-md border-transparent bg-ink/6 px-2 py-0 text-xs font-medium text-ink gap-1.5 shadow-none hover:bg-ink/10 hover:text-ink [&_svg]:size-3.5';
  const splitActionButtonClass =
    'h-6 rounded-r-none border-transparent border-r-0 bg-ink/6 px-2 py-0 text-xs font-medium text-ink gap-1.5 shadow-none hover:bg-ink/10 hover:text-ink [&_svg]:size-3.5';
  const splitArrowButtonClass =
    'h-6 w-6 rounded-l-none border-transparent border-l border-l-edge-muted/70 bg-ink/6 p-0 text-xs font-medium text-ink shadow-none hover:bg-ink/10 hover:text-ink [&_svg]:size-3.5';

  const SingleOptionButton = (props: { hideLabel?: boolean }) => (
    <Button
      variant="base"
      depth={1}
      noTouchResize
      class={actionButtonClass}
      size="sm"
      onClick={() => handleSelect(options()[0])}
    >
      <PlusIcon class="text-ink-muted" />
      <Show when={!props.hideLabel}>
        <span class="capitalize">{primaryCreateLabel()}</span>
      </Show>
    </Button>
  );

  const MultiOptionButton = (props: { hideLabel?: boolean }) => {
    const moreOptions = () => options().slice(1);
    return (
      <Show when={moreOptions().length > 0} fallback={<SingleOptionButton {...props} />}>
        <div class="flex items-center">
          <Button
            variant="base"
            depth={1}
            noTouchResize
            class={splitActionButtonClass}
            size="sm"
            onClick={() => handleSelect(options()[0])}
          >
            <PlusIcon class="text-ink-muted" />
            <Show when={!props.hideLabel}>
              <span class="capitalize">{primaryCreateLabel()}</span>
            </Show>
          </Button>
          <Dropdown placement="bottom-start">
            <Dropdown.Trigger
              variant="base"
              depth={1}
              noTouchResize
              class={splitArrowButtonClass}
              size="sm"
              aria-label={`More ${createLabel().toLowerCase()} options`}
            >
              <ChevronDownIcon class="text-ink-extra-muted" />
            </Dropdown.Trigger>
            <Dropdown.Content depth={2}>
              <Dropdown.Group>
                <For each={moreOptions()}>
                  {(item) => (
                    <Dropdown.Item onSelect={() => handleSelect(item)}>
                      <span class="size-3.5 flex items-center justify-center shrink-0 text-ink-muted">
                        <CreateOptionIcon id={item.id} />
                      </span>
                      <span class="flex-1 truncate">{item.label}</span>
                    </Dropdown.Item>
                  )}
                </For>
              </Dropdown.Group>
            </Dropdown.Content>
          </Dropdown>
        </div>
      </Show>
    );
  };

  const ImportButton = () => (
    <Show
      when={importOptions().length > 1}
      fallback={
        <Button
          variant="ghost"
          depth={1}
          noTouchResize
          class="size-6 p-1 text-ink-muted hover:text-ink"
          size="icon-sm"
          tooltip={primaryImportLabel()}
          onClick={() => handleSelect(importOptions()[0])}
        >
          <UploadIcon />
        </Button>
      }
    >
      <Dropdown placement="bottom-start">
        <Dropdown.Trigger
          variant="ghost"
          depth={1}
          noTouchResize
          class="size-6 p-1 text-ink-muted hover:text-ink"
          size="icon-sm"
          label="Import"
          aria-label="Import"
        >
          <UploadIcon />
        </Dropdown.Trigger>
        <Dropdown.Content depth={2}>
          <Dropdown.Group>
            <For each={importOptions()}>
              {(item) => (
                <Dropdown.Item onSelect={() => handleSelect(item)}>
                  <span class="size-3.5 flex items-center justify-center shrink-0 text-ink-muted">
                    <CreateOptionIcon id={item.id} />
                  </span>
                  <span class="flex-1 truncate">{item.label}</span>
                </Dropdown.Item>
              )}
            </For>
          </Dropdown.Group>
        </Dropdown.Content>
      </Dropdown>
    </Show>
  );

  return (
    <>
      <Show when={currentView() === 'calls'}>
        <NewCallButton />
      </Show>
      <Show when={options().length > 0}>
        <CollapsibleHeaderItem
          id="create-button"
          priority={2}
          expanded={() => (
            <Show when={options().length > 1} fallback={<SingleOptionButton />}>
              <MultiOptionButton />
            </Show>
          )}
          collapsed={() => (
            <Show
              when={options().length > 1}
              fallback={<SingleOptionButton hideLabel />}
            >
              <MultiOptionButton hideLabel />
            </Show>
          )}
        />
      </Show>
      <Show when={importOptions().length > 0}>
        <CollapsibleHeaderItem
          id="import-button"
          priority={3}
          containerClass="ml-1.5"
          expanded={() => <ImportButton />}
          collapsed={() => <ImportButton />}
        />
      </Show>
    </>
  );
};
