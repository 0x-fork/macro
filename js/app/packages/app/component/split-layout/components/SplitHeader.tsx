import { useSoup } from '@app/component/next-soup/soup-context';
import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { isListViewID, LIST_VIEW_ID } from '@app/constants/list-views';
import type { BlockName } from '@core/block';
import { fileTypeToBlockName } from '@core/constant/allBlocks';
import { DEV_MODE_ENV } from '@core/constant/featureFlags';
import { TOKENS } from '@core/hotkey/tokens';
import { toast } from '@core/component/Toast/Toast';
import { isMobile } from '@core/mobile/isMobile';
import type { EntityDragEvent } from '@entity';
import { AnimatedNewSplitIcon } from '@icon/wide-newSplit';
import CollapseIcon from '@phosphor/arrows-in.svg';
import ExpandIcon from '@phosphor/arrows-out.svg';
import CaretDown from '@phosphor/caret-down.svg';
import CaretLeft from '@phosphor/caret-left.svg';
import CaretRight from '@phosphor/caret-right.svg';
import CaretUp from '@phosphor/caret-up.svg';
import ArrowLineLeftIcon from '@phosphor/arrow-line-left.svg';
import ArrowLineRightIcon from '@phosphor/arrow-line-right.svg';
import ClockCounterClockwiseIcon from '@phosphor/clock-counter-clockwise.svg';
import CopyIcon from '@phosphor/copy.svg';
import DotsThreeIcon from '@phosphor/dots-three-vertical.svg';
import CloseIcon from '@phosphor/x.svg';
import { mergeRefs } from '@solid-primitives/refs';
import { createDroppable, useDragDropContext } from '@thisbeyond/solid-dnd';
import { Button, cn, Dropdown } from '@ui';
import {
  createMemo,
  type ParentProps,
  type Setter,
  Show,
  useContext,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { SplitLayoutContext, SplitPanelContext } from '../context';
import type { SplitContent } from '../layoutManager';
import { canSpotlight } from '../utils/canSpotlight';

export { SplitHeaderBadge } from './SplitLabel';

function SplitMoreMenuButton() {
  const panel = useContext(SplitPanelContext);
  const layout = useContext(SplitLayoutContext);
  if (!panel || !layout) return null;

  const splits = () => layout.manager.splits();
  const currentIndex = () => splits().findIndex((split) => split.id === panel.handle.id);
  const currentContent = () => panel.handle.content();
  const canCreateNewSplit = () => layout.manager.canAppendSplit();
  const canMoveLeft = () => currentIndex() > 0;
  const canMoveRight = () => {
    const index = currentIndex();
    return index >= 0 && index < splits().length - 1;
  };
  const canCloseOtherSplits = () => splits().length > 1;

  const handleNewSplitClick = () => {
    if (!layout.manager.canAppendSplit()) return;
    layout.manager.createNewSplit({
      content: { type: 'component', id: LIST_VIEW_ID.inbox },
      activate: true,
      allowDuplicate: true,
      referredFrom: 'sidebar',
    });
  };

  const handleDuplicateSplit = () => {
    if (!layout.manager.canAppendSplit()) return;
    layout.manager.createNewSplit({
      content: currentContent(),
      activate: true,
      allowDuplicate: true,
      referredFrom: panel.handle.referredFrom(),
    });
  };

  const moveSplit = (offset: -1 | 1) => {
    const index = currentIndex();
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= splits().length) return;

    const content = currentContent();
    const next = [...splits()].map((split) => split.content);
    [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
    layout.manager.reconcile(next);
    layout.manager.getSplitByContent(content.type, content.id)?.activate();
  };

  const closeOtherSplits = () => {
    layout.manager.replaceAllSplits(currentContent(), {
      referredFrom: panel.handle.referredFrom(),
    });
  };

  const resetSplitLayout = () => {
    layout.manager.replaceAllSplits(
      { type: 'component', id: LIST_VIEW_ID.inbox },
      { referredFrom: null }
    );
  };

  const copyDebugInfo = async () => {
    const debugInfo = {
      splitId: panel.handle.id,
      index: currentIndex(),
      displayName: panel.handle.displayName(),
      content: panel.handle.content(),
      history: panel.handle.history(),
      referredFrom: panel.handle.referredFrom(),
      isActive: panel.handle.isActive(),
      isFirst: panel.handle.isFirst(),
      isLast: panel.handle.isLast(),
      isSpotlight: panel.handle.isSpotLight(),
      canGoBack: panel.handle.canGoBack(),
      canGoForward: panel.handle.canGoForward(),
      splitCount: splits().length,
      activeSplitId: layout.manager.activeSplitId(),
    };

    await navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
    console.info('Split debug info', debugInfo);
    toast.success('Copied split debug info');
  };

  return (
    <Show when={!isMobile()}>
      <Dropdown placement="bottom-start">
        <Dropdown.Trigger
          size="sm"
          variant="ghost"
          class="p-1 [&_svg]:size-4"
          label="Split options"
        >
          <DotsThreeIcon class="text-ink-extra-muted" />
        </Dropdown.Trigger>
        <Dropdown.Content class="min-w-44">
          <Dropdown.Group>
            <Dropdown.Item
              disabled={!canCreateNewSplit()}
              onSelect={handleNewSplitClick}
            >
              <AnimatedNewSplitIcon class="size-4 shrink-0" />
              <span class="flex-1 truncate">New split</span>
            </Dropdown.Item>
            <Dropdown.Item
              disabled={!canCreateNewSplit()}
              onSelect={handleDuplicateSplit}
            >
              <CopyIcon class="size-4 shrink-0" />
              <span class="flex-1 truncate">Duplicate split</span>
            </Dropdown.Item>
            <Show when={canSpotlight(layout.manager)}>
              <Dropdown.Item onSelect={() => panel.handle.toggleSpotlight()}>
                <Show
                  when={panel.handle.isSpotLight()}
                  fallback={<ExpandIcon class="size-4 shrink-0" />}
                >
                  <CollapseIcon class="size-4 shrink-0" />
                </Show>
                <span class="flex-1 truncate">
                  {panel.handle.isSpotLight() ? 'Minimize split' : 'Spotlight split'}
                </span>
              </Dropdown.Item>
            </Show>
          </Dropdown.Group>
          <Dropdown.Group>
            <Dropdown.Item disabled={!canMoveLeft()} onSelect={() => moveSplit(-1)}>
              <ArrowLineLeftIcon class="size-4 shrink-0" />
              <span class="flex-1 truncate">Move split left</span>
            </Dropdown.Item>
            <Dropdown.Item disabled={!canMoveRight()} onSelect={() => moveSplit(1)}>
              <ArrowLineRightIcon class="size-4 shrink-0" />
              <span class="flex-1 truncate">Move split right</span>
            </Dropdown.Item>
          </Dropdown.Group>
          <Dropdown.Group>
            <Dropdown.Item
              disabled={!canCloseOtherSplits()}
              onSelect={closeOtherSplits}
            >
              <CloseIcon class="size-4 shrink-0" />
              <span class="flex-1 truncate">Close other splits</span>
            </Dropdown.Item>
            <Dropdown.Item onSelect={resetSplitLayout}>
              <ClockCounterClockwiseIcon class="size-4 shrink-0" />
              <span class="flex-1 truncate">Reset split layout</span>
            </Dropdown.Item>
          </Dropdown.Group>
          <Show when={DEV_MODE_ENV}>
            <Dropdown.Group>
              <Dropdown.Item onSelect={() => void copyDebugInfo()}>
                <CopyIcon class="size-4 shrink-0" />
                <span class="flex-1 truncate">Copy debug info</span>
              </Dropdown.Item>
            </Dropdown.Group>
          </Show>
        </Dropdown.Content>
      </Dropdown>
    </Show>
  );
}

function getEntitySplitContent(data: EntityDragEvent['draggable']['data']):
  | {
      type: SplitContent['type'];
      id: string;
    }
  | undefined {
  if (data.type === 'document') {
    return {
      type: fileTypeToBlockName(data.subType?.type ?? data.fileType) as
        | BlockName
        | 'unknown',
      id: data.id,
    };
  }

  if (data.type === 'channel_message') {
    return { type: 'channel', id: data.channelId };
  }

  if (data.type === 'foreign') return undefined;

  if (data.type === 'crm_company') return { type: 'company', id: data.id };
  if (data.type === 'crm_contact') return { type: 'contact', id: data.id };

  return { type: data.type, id: data.id };
}

function SplitBackButton() {
  const context = useContext(SplitPanelContext);
  if (!context) return null;
  return (
    <Button
      size="sm"
      class="p-1"
      label="Go Back"
      hotkey={TOKENS.split.go.back}
      disabled={!context.handle.canGoBack()}
      onClick={context.handle.goBack}
    >
      <CaretLeft />
    </Button>
  );
}

function SplitForwardButton() {
  const context = useContext(SplitPanelContext);
  if (!context) return '';
  return (
    <Button
      size="sm"
      label="Go Forward"
      hotkey={TOKENS.split.go.forward}
      disabled={!context.handle.canGoForward()}
      onClick={context.handle.goForward}
      class={cn(
        'p-1 rounded-lg',
        isMobile() && !context.handle.canGoForward() && 'hidden'
      )}
    >
      <CaretRight />
    </Button>
  );
}

function _SplitSpotlightButton() {
  const context = useContext(SplitPanelContext);
  const layout = useContext(SplitLayoutContext);
  if (!context || !layout) return '';
  return (
    <Show when={canSpotlight(layout.manager)}>
      <Button
        size="sm"
        class="p-1 rounded-xs hidden"
        label={
          context.handle.isSpotLight() ? 'Minimize Split' : 'Spotlight Split'
        }
        hotkey={TOKENS.window.spotlight.toggle}
        onClick={() => context.handle.toggleSpotlight()}
      >
        {context.handle.isSpotLight() ? <CollapseIcon /> : <ExpandIcon />}
      </Button>
    </Show>
  );
}

function SplitCloseButton() {
  const context = useContext(SplitPanelContext);
  const layout = useContext(SplitLayoutContext);
  if (!context || !layout) return null;

  const label = createMemo(() => {
    const isOnlySplit = layout.manager.splits().length === 1;
    const isNotUnifiedList = !isListViewID(context.handle.content().id);
    return isOnlySplit && isNotUnifiedList ? 'Return to list' : 'Close';
  });

  return (
    <Show when={layout.manager.splits().length > 1}>
      <Button
        size="sm"
        class="p-1"
        label={label()}
        hotkey={TOKENS.split.close}
        onClick={context.handle.close}
      >
        <CloseIcon />
      </Button>
    </Show>
  );
}

function SoupNavigationButtons() {
  const context = useContext(SplitPanelContext);
  const soup = useSoup();
  if (!context) return null;

  const rows = createMemo(() => soup.rows());
  const currentIndex = () => soup.focus.index();

  const navigationReferredFrom = createMemo(() => {
    const referredFrom = context.handle.referredFrom();
    if (referredFrom !== 'inbox' && referredFrom !== 'mail') {
      return;
    }

    return referredFrom;
  });

  const shouldShow = createMemo(() => {
    const referredFrom = navigationReferredFrom();
    const isNavigableListView =
      referredFrom === 'inbox' || referredFrom === 'mail';

    return isNavigableListView && rows().length > 0;
  });

  const canNavigateUp = createMemo(() => {
    return rows().length > 0 && currentIndex() !== 0;
  });

  const canNavigateDown = createMemo(() => {
    return rows().length > 0 && currentIndex() !== rows().length - 1;
  });

  const navigate = (offset: number) => {
    const next = soup.navigate.by(offset);
    if (!next) return;

    void openEntityInSplitFromUnifiedList(next.row.original, {
      splitHandle: context.handle,
      mergeHistory: true,
      referredFrom: navigationReferredFrom(),
    });
  };

  return (
    <Show when={shouldShow()}>
      <div class="flex items-center gap-0.5 pl-1">
        <Button
          class="p-1 rounded-lg"
          label="Previous item"
          hotkey={TOKENS.entity.step.start}
          disabled={!canNavigateUp()}
          onClick={() => navigate(-1)}
        >
          <CaretUp class="size-4" />
        </Button>
        <Button
          class="p-1 rounded-lg"
          label="Next item"
          hotkey={TOKENS.entity.step.end}
          disabled={!canNavigateDown()}
          onClick={() => navigate(1)}
        >
          <CaretDown class="size-4" />
        </Button>
      </div>
    </Show>
  );
}

export function SplitHeader(props: { ref: Setter<HTMLDivElement | null> }) {
  const panel = useContext(SplitPanelContext);
  if (!panel) {
    throw new Error('<SplitHeader> must be used within a <SplitLayout>');
  }

  const droppableId = `split-header-${panel.handle.id}`;
  const droppable = createDroppable(droppableId, {
    type: 'split-header',
  });
  const [dragDropState, { onDragEnd }] = useDragDropContext() ?? [
    undefined,
    { onDragEnd: () => {} },
  ];

  const isEntityDraggingOver = createMemo(() => {
    const data = dragDropState?.active.draggable?.data;
    return (
      data?.dragType === 'entity' &&
      dragDropState?.active.droppable?.id === droppableId
    );
  });

  onDragEnd((event: EntityDragEvent) => {
    if (event.droppable?.id !== droppableId) return;

    const data = event.draggable?.data;
    if (!data || data.dragType !== 'entity') return;

    const current = panel.handle.content();
    const next = getEntitySplitContent(data);
    if (!next) return;
    if (current.type === next.type && current.id === next.id) return;

    void openEntityInSplitFromUnifiedList(data, {
      splitHandle: panel.handle,
      allowDuplicate: true,
    });
  });

  return (
    <div
      class={cn(
        'isolate relative w-full h-full overflow-clip text-ink shrink-0 bg-surface',
        isMobile() && isListViewID(panel.handle.content().id) && 'hidden',
        isEntityDraggingOver() && 'bg-active/50'
      )}
      data-split-header
      ref={mergeRefs(droppable, props.ref)}
    >
      <Show when={panel.panelRef()}>
        {(panelRef) => (
          <Portal mount={panelRef()}>
            <Show when={isEntityDraggingOver()}>
              <div
                class="pointer-events-none absolute inset-0 rounded-xl z-modal-overlay bg-modal-overlay pattern-diagonal-4 pattern-edge-muted flex items-center justify-center"
                data-split-header-drop-overlay
              >
                <div class="max-w-[min(28rem,calc(100%-3rem))] min-w-0 bg-surface border border-edge rounded-lg shadow-lg shadow-drop-shadow px-4 py-3 flex items-center gap-2 text-sm text-ink">
                  <span class="shrink-0 text-ink-muted">
                    Open in this split
                  </span>
                </div>
              </div>
            </Show>
          </Portal>
        )}
      </Show>
      <div class="absolute inset-0">
        <div class="absolute inset-y-0 left-0 z-10 flex items-center pl-2 mobile:pl-0">
          <div class="mobile:hidden">
            <SplitCloseButton />
          </div>
          <Show when={!(isMobile() && isListViewID(panel.handle.content().id))}>
            <SplitBackButton />
            <SplitForwardButton />
          </Show>
          <SplitMoreMenuButton />
        </div>

        <div class="pointer-events-none absolute inset-y-0 left-28 right-20 flex min-w-0 items-center justify-center">
          <div
            class="pointer-events-auto min-w-0 max-w-full flex items-center justify-center gap-0.5 empty:hidden"
            data-split-portal-target
            ref={(ref) => {
              panel.layoutRefs.headerLeft = ref;
            }}
          />
        </div>

        <div
          class="absolute inset-y-0 right-0 z-10 min-w-4 h-full flex items-center justify-end gap-0.5 px-2 empty:hidden"
          data-split-portal-target
          ref={(ref) => {
            panel.layoutRefs.headerRight = ref;
          }}
        />
      </div>
    </div>
  );
}

export function SplitHeaderLeft(props: ParentProps) {
  const ctx = useContext(SplitPanelContext);
  if (!ctx)
    throw new Error('<SplitHeaderLeft> must be used within a <SplitLayout>');

  return (
    <Show when={ctx.layoutRefs.headerLeft}>
      <Portal
        mount={ctx.layoutRefs.headerLeft}
        ref={(div) => (div.style.display = 'contents')}
      >
        {props.children}
      </Portal>
    </Show>
  );
}

export function SplitHeaderRight(props: ParentProps) {
  const ctx = useContext(SplitPanelContext);
  if (!ctx)
    throw new Error('<SplitHeaderRight> must be used within a <SplitLayout>');

  return (
    <Show when={ctx.layoutRefs.headerRight}>
      <Portal
        mount={ctx.layoutRefs.headerRight}
        ref={(div) => (div.style.display = 'contents')}
      >
        {props.children}
      </Portal>
    </Show>
  );
}
