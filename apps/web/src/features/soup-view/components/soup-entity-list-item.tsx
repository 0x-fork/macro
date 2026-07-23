import {
  List,
  type ListActivation,
  type ListItemState,
  useList,
} from '@app/components/list';
import {
  navigateChannelEntityToTarget,
  openEntityInNewTab,
  openEntityInSplitFromUnifiedList,
} from '@app/features/next-soup/utils';
import type { SoupEntityRow, SoupRow } from '@app/features/soup-list';
import { useGlobalBlockOrchestrator } from '@components/app/GlobalAppState';
import { useLongPress } from '@components/app/mobile/use-long-press';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { hapticImpact } from '@core/mobile/haptics';
import { useIsKeyPressActive } from '@core/util/useIsKeyPressActive';
import {
  isNonMemberChannelEntity,
  isSearchEntity,
  type ProjectEntity,
  type SearchLocation,
} from '@entity';
import type { EntityRowConfig } from '@entity/extractors-notification';
import CheckCircleIcon from '@phosphor/check-circle.svg';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  onCleanup,
  onMount,
} from 'solid-js';
import { actionTargets } from '../actions/soup-entity-action-model';
import { useSoupView } from '../context';
import { SoupEntityContextMenu } from './soup-entity-context-menu';
import { useMaybeSoupMobileActionDrawer } from './soup-mobile-action-drawer';

export const SOUP_MARK_DONE_ROW_CONFIG: EntityRowConfig = {
  swipeLeftColor: 'bg-success-surface',
  swipeLeftRevealedComponent: <CheckCircleIcon class="size-5 text-ink" />,
};

export type SoupEntityListItemScope = {
  item: Accessor<SoupEntityRow>;
  focused: Accessor<boolean>;
  selected: Accessor<boolean>;
  pressed: Accessor<boolean>;
  highlighted: Accessor<boolean>;
  onChecked: (selected: boolean, shiftKey: boolean) => void;
  onClick: (event: MouseEvent) => void;
  onProjectClick: (
    project: ProjectEntity,
    event: MouseEvent | PointerEvent
  ) => void;
  onContentHitClick: (
    event: MouseEvent | PointerEvent,
    location?: SearchLocation
  ) => void;
};

type SoupActivationMetadata = {
  event?: MouseEvent | PointerEvent;
  location?: SearchLocation;
  project?: ProjectEntity;
  navigateChannelTarget?: boolean;
  openInNewSplit?: boolean;
};

type SoupEntityClickDependencies = {
  item: Accessor<SoupEntityRow>;
  state: ListItemState;
  previewPaneVisible: Accessor<boolean>;
  activate: (metadata: SoupActivationMetadata) => void;
};

export function handleSoupEntityClick(
  dependencies: SoupEntityClickDependencies,
  event: MouseEvent
) {
  if (dependencies.previewPaneVisible()) {
    const alreadyFocused = dependencies.state.focused();
    dependencies.state.focus({ reason: 'pointer' });
    const type = dependencies.item().entity.type;
    if (
      alreadyFocused &&
      (type === 'channel' ||
        type === 'channel_message' ||
        type === 'channel_thread')
    ) {
      dependencies.activate({ event, navigateChannelTarget: true });
    }
    return;
  }
  dependencies.state.focus({ reason: 'pointer' });
  dependencies.activate({ event });
}

const selectionAnchors = new WeakMap<object, number>();

export function SoupEntityListItem(props: {
  item: Accessor<SoupEntityRow>;
  children: (scope: SoupEntityListItemScope) => JSX.Element;
  hoverFocus?: boolean | Accessor<boolean>;
  onActivate?: (activation: ListActivation<SoupRow>) => void;
}) {
  const panel = useSplitPanelOrThrow();
  const orchestrator = useGlobalBlockOrchestrator();
  const { previewOpen, previewPaneVisible, view } = useSoupView();
  const mobileActionDrawer = useMaybeSoupMobileActionDrawer();
  const { state: listState } = useList<SoupRow>();
  const [touchPressed, setTouchPressed] = createSignal(false);
  const { isKeypressActive } = useIsKeyPressActive();
  const hoverFocus = () =>
    typeof props.hoverFocus === 'function'
      ? props.hoverFocus()
      : (props.hoverFocus ?? true);
  const selectedEntities = createMemo(() =>
    listState.selection
      .selected()
      .flatMap((item) => (item.kind === 'entity' ? [item.entity] : []))
  );

  createEffect(() => {
    if (listState.selection.count() === 0) selectionAnchors.delete(listState);
  });

  const index = () => listState.items.indexOf(props.item().id);
  const setItemSelected = (selected: boolean, shiftKey: boolean) => {
    const item = props.item();
    const itemIndex = index();
    if (!shiftKey) {
      if (selected) listState.selection.select(item);
      else listState.selection.deselect(item.id);
      selectionAnchors.set(listState, itemIndex);
      return;
    }

    const anchor = selectionAnchors.get(listState) ?? itemIndex;
    const start = Math.min(anchor, itemIndex);
    const end = Math.max(anchor, itemIndex);
    for (const candidate of listState.items.all().slice(start, end + 1)) {
      if (!listState.selection.isSelectable(candidate)) continue;
      if (selected) listState.selection.select(candidate);
      else listState.selection.deselect(candidate.id);
    }
  };

  const open = (metadata: SoupActivationMetadata) => {
    const item = props.item();
    if (isNonMemberChannelEntity(item.entity)) return;

    const activation: ListActivation<SoupRow> = {
      item,
      index: index(),
      reason: 'pointer',
      metadata,
    };
    props.onActivate?.(activation);
    const entity = metadata.project ?? item.entity;

    if (metadata.navigateChannelTarget) {
      void navigateChannelEntityToTarget(entity, orchestrator);
      return;
    }

    let location = metadata.location;
    if (!location && isSearchEntity(entity)) {
      const hits = entity.search.contentHitData;
      if (hits?.length === 1) location = hits[0]?.location;
    }

    if (metadata.event?.metaKey || metadata.event?.ctrlKey) {
      openEntityInNewTab({ entity, location });
      return;
    }

    void openEntityInSplitFromUnifiedList(entity, {
      splitHandle: panel.handle,
      referredFrom: view(),
      location,
      openInNewSplit:
        metadata.openInNewSplit ?? metadata.event?.shiftKey ?? false,
    });
  };

  return (
    <List.Item item={props.item()}>
      {(state) => {
        const onLongPress = () => {
          hapticImpact('light');
          state.focus({ reason: 'pointer' });
          if (!mobileActionDrawer) {
            setItemSelected(!state.selected(), false);
            return;
          }
          mobileActionDrawer.open(
            props.item().entity,
            actionTargets({
              entity: props.item().entity,
              selected: selectedEntities(),
              entityIsSelected: state.selected(),
            })
          );
        };
        const { longPressHandlers, consumeLongPress } = useLongPress({
          onLongPress,
          onPressChange: setTouchPressed,
        });
        let container: HTMLDivElement | undefined;

        onMount(() => {
          const captureClick = (event: MouseEvent) => consumeLongPress(event);
          container?.addEventListener('click', captureClick, { capture: true });
          onCleanup(() =>
            container?.removeEventListener('click', captureClick, {
              capture: true,
            })
          );
        });

        const scope: SoupEntityListItemScope = {
          item: props.item,
          focused: state.focused,
          selected: state.selected,
          pressed: touchPressed,
          highlighted: createMemo(() => state.focused() || touchPressed()),
          onChecked: setItemSelected,
          onClick: (event) =>
            handleSoupEntityClick(
              {
                item: props.item,
                state,
                previewPaneVisible,
                activate: open,
              },
              event
            ),
          onProjectClick: (project, event) => open({ event, project }),
          onContentHitClick: (event, location) => open({ event, location }),
        };

        return (
          <SoupEntityContextMenu
            entity={props.item().entity}
            selectedEntities={selectedEntities}
            isSelected={state.selected}
            onOpen={() => state.focus({ reason: 'pointer' })}
          >
            <div
              ref={container}
              class="size-full"
              onMouseMove={() => {
                if (isKeypressActive() || previewOpen() || !hoverFocus())
                  return;
                state.focus({ reason: 'hover' });
              }}
              {...longPressHandlers}
            >
              {props.children(scope)}
            </div>
          </SoupEntityContextMenu>
        );
      }}
    </List.Item>
  );
}
