import {
  type BlockTool,
  ResponsiveBlockToolbar,
  ToolButton,
} from '@app/component/ResponsiveBlockToolbar';
import { useSidePanel } from '@app/component/side-panel';
import { useDrawerControl } from '@app/component/split-layout/components/SplitDrawerContext';
import {
  type FileOperation,
  SplitFileMenu,
} from '@app/component/split-layout/components/SplitFileMenu';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import {
  BlockItemSplitLabel,
  StaticSplitLabel,
} from '@app/component/split-layout/components/SplitLabel';
import { useSplitPanel } from '@app/component/split-layout/layoutUtils';
import { useDownloadDocumentAsMarkdownText } from '@block-md/signal/save';
import { useBlockAliasedName, useBlockId, useBlockName } from '@core/block';
import { BlockLiveIndicators } from '@core/component/LiveIndicators';
import { toast } from '@core/component/Toast/Toast';
import {
  getShareDrawerRecipientInput,
  ShareTrigger,
  useShareDialogContext,
} from '@core/component/TopBar/ShareButton';
import {
  ENABLE_HISTORY_COMPONENT,
  ENABLE_MARKDOWN_LIVE_COLLABORATION,
  ENABLE_MARKDOWN_SIDE_PANEL,
} from '@core/constant/featureFlags';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { isMobile } from '@core/mobile/isMobile';
import { blockHotkeyScopeSignal } from '@core/signal/blockElement';
import { useCanEdit } from '@core/signal/permissions';
import { copyBranchNameToClipboard } from '@core/util/branchName';
import { useBlockDocumentName } from '@core/util/currentBlockDocumentName';
import { buildSimpleEntityUrl } from '@core/util/url';
import IconShared from '@icon/wide-share.svg';
import ClockIcon from '@phosphor/clock-counter-clockwise.svg';
import Download from '@phosphor/download.svg';
import GitBranch from '@phosphor/git-branch.svg';
import InfoIcon from '@phosphor/info.svg';
import IconLink from '@phosphor/link.svg';
import SidePanelIcon from '@phosphor/square-half.svg';
import { blockNameToItemType } from '@service-storage/client';
import { Button, cn } from '@ui';
import {
  type Accessor,
  createEffect,
  For,
  on,
  onCleanup,
  Show,
} from 'solid-js';
import { HISTORY_DRAWER_ID } from './History';

export function TopBar(props: { name?: Accessor<string | undefined> } = {}) {
  const canEdit = useCanEdit();
  const blockName = useBlockName();
  const blockId = useBlockId();
  const scopeId = blockHotkeyScopeSignal.get;
  const fallbackName = useBlockDocumentName();
  const name = () => props.name?.() ?? fallbackName();
  const itemType = blockNameToItemType(blockName);
  if (!itemType)
    throw new Error('Using functionality in an unknown item type.');

  const downloadAsMarkdownText = useDownloadDocumentAsMarkdownText();

  const historyControl = useDrawerControl(HISTORY_DRAWER_ID);
  const shareCtx = useShareDialogContext();
  const blockAliasedName = useBlockAliasedName();
  const isTask = blockAliasedName === 'task';

  const copyLink = () => {
    const url = buildSimpleEntityUrl({ id: blockId, type: blockAliasedName });
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard.', {
      subtext:
        'Sending this link in a Macro message will automatically update permissions to include recipients.',
    });
  };

  const copyBranchName = () => copyBranchNameToClipboard(blockId);

  if (isTask) {
    let cleanupKbShortcut = () => {};

    createEffect(
      on(scopeId, (id) => {
        cleanupKbShortcut();
        registerHotkey({
          hotkey: 'shift+cmd+b',
          scopeId: id,
          hotkeyToken: TOKENS.entity.action.copyBranchName,
          description: 'Copy branch name',
          keyDownHandler: () => {
            copyBranchName();
            return true;
          },
          runWithInputFocused: true,
        });
      })
    );
  }

  const ops: FileOperation[] = [
    { op: 'copy' },
    { op: 'rename' },
    { op: 'moveToProject' },
    ...(isTask
      ? ([
          {
            label: 'Copy Branch Name',
            icon: GitBranch,
            action: copyBranchName,
            group: 'copy',
          },
        ] satisfies FileOperation[])
      : []),
    {
      label: 'Download',
      icon: Download,
      action: downloadAsMarkdownText,
      group: 'file',
    },
    { op: 'delete' },
  ];

  const sidePanel = useSidePanel();
  const splitPanel = useSplitPanel();
  const compactHeader = () => (splitPanel?.panelSize.width ?? Infinity) < 440;

  // Register at the split scope so `]` works from anywhere in the split
  // (header, toolbar, drawer), but tie disposal to this TopBar so the
  // registration disappears with the block.
  if (splitPanel?.splitHotkeyScope) {
    const reg = registerHotkey({
      hotkey: ']',
      scopeId: splitPanel.splitHotkeyScope,
      hotkeyToken: TOKENS.block.toggleSidePanel,
      description: 'Toggle Side Panel',
      keyDownHandler: () => {
        if (!sidePanel) return false;
        if (!sidePanel.hasSections()) return false;
        sidePanel.toggle();
        return true;
      },
    });
    onCleanup(() => reg.dispose());
  }

  const headerMenuTools: BlockTool[] = [
    {
      label: 'Share',
      icon: IconShared,
      action: () => shareCtx.open(),
      condition: () => !isMobile() && compactHeader(),
      focusTarget: getShareDrawerRecipientInput,
      menuGroup: 'share',
    },
    {
      label: 'Copy Link',
      icon: IconLink,
      action: copyLink,
      condition: () => !isMobile() && compactHeader(),
      menuGroup: 'share',
    },
    {
      label: 'View details',
      icon: SidePanelIcon,
      action: () => sidePanel?.setIsOpen(true),
      condition: () =>
        !isMobile() &&
        compactHeader() &&
        ENABLE_MARKDOWN_SIDE_PANEL &&
        (sidePanel?.hasSections() ?? false),
      menuGroup: 'copy',
    },
  ];

  const tools: BlockTool[] = [
    {
      label: 'History',
      icon: ClockIcon,
      action: historyControl.toggle,
      isActive: historyControl.isOpen,
      condition: () =>
        ENABLE_MARKDOWN_LIVE_COLLABORATION &&
        ENABLE_HISTORY_COMPONENT &&
        canEdit(),
    },
    // {
    //   label: 'Copy Branch Name',
    //   icon: GitBranch,
    //   action: copyBranchName,
    //   condition: () => isTask,
    //   hotkeyToken: TOKENS.entity.action.copyBranchName,
    // },
    {
      label: 'Share',
      icon: IconShared,
      action: () => shareCtx.open(),
      condition: isMobile,
      buttonComponent: () => <ShareTrigger />,
      focusTarget: getShareDrawerRecipientInput,
    },
    {
      label: 'Copy Link',
      icon: IconLink,
      action: copyLink,
      condition: isMobile,
    },
  ];

  return (
    <>
      <SplitHeaderLeft>
        <div class="flex min-w-0 flex-1 flex-col justify-center">
          <div class="flex min-w-0 flex-1 items-center">
            <div class="min-w-0 overflow-hidden">
              <BlockItemSplitLabel name={name} />
            </div>
            <Show when={!isMobile() && ops.length > 0}>
              <SplitFileMenu
                id={blockId}
                itemType={itemType}
                name={name()}
                ops={ops}
                tools={headerMenuTools}
                buttonClass="ml-1 size-6 p-1 shrink-0 text-ink-extra-muted hover:text-ink [&_svg]:size-3.5"
              />
            </Show>
          </div>
        </div>
      </SplitHeaderLeft>

      <SplitHeaderRight>
        <Show when={!isMobile() && !compactHeader()}>
          <ShareTrigger />
        </Show>
        <Show
          when={
            sidePanel && ENABLE_MARKDOWN_SIDE_PANEL && !compactHeader()
              ? sidePanel
              : undefined
          }
        >
          {(panel) => (
            <Button
              depth={2}
              variant="base"
              size="icon-sm"
              class={cn('ml-1.5 size-6 p-1 bg-surface [&_svg]:size-3.5', {
                'bg-active text-ink': panel().isOpen(),
              })}
              tooltip={
                panel().isNarrow()
                  ? 'View details'
                  : panel().isOpen()
                    ? 'Hide Side Panel'
                    : 'Show Side Panel'
              }
              hotkey={TOKENS.block.toggleSidePanel}
              onClick={() => {
                panel().toggle();
              }}
            >
              <Show when={panel().isNarrow()} fallback={<SidePanelIcon />}>
                <InfoIcon />
              </Show>
            </Button>
          )}
        </Show>
        <div class="-order-1">
          <BlockLiveIndicators />
        </div>
      </SplitHeaderRight>

      <ResponsiveBlockToolbar
        tools={tools}
        ops={isMobile() ? ops : []}
        id={blockId}
        itemType={itemType}
        name={name()}
      />
    </>
  );
}

export function InstructionsTopBar() {
  const canEdit = useCanEdit();
  const historyControl = useDrawerControl(HISTORY_DRAWER_ID);

  const tools: BlockTool[] = [
    {
      label: 'History',
      icon: ClockIcon,
      action: historyControl.toggle,
      isActive: historyControl.isOpen,
      condition: () =>
        ENABLE_MARKDOWN_LIVE_COLLABORATION &&
        ENABLE_HISTORY_COMPONENT &&
        canEdit(),
    },
  ];

  return (
    <>
      <SplitHeaderLeft>
        <StaticSplitLabel label="AI Instructions" iconType="md" />
      </SplitHeaderLeft>
      <For each={tools}>
        {(tool) => (
          <Show when={!tool.condition || tool.condition()}>
            {tool.buttonComponent ? (
              <tool.buttonComponent />
            ) : (
              <ToolButton tool={tool} />
            )}
          </Show>
        )}
      </For>
    </>
  );
}
