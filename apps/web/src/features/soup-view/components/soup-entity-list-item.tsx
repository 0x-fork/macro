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
import {
  type SoupCollectionSort,
  type SoupEntityItem,
  type SoupItem,
  useSoupCollection,
} from '@app/features/soup-list';
import { useGlobalBlockOrchestrator } from '@components/app/GlobalAppState';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useIsKeyPressActive } from '@core/util/useIsKeyPressActive';
import {
  isSearchEntity,
  type ProjectEntity,
  type SearchLocation,
} from '@entity';
import type { EntityRowConfig } from '@entity/extractors-notification';
import CheckCircleIcon from '@phosphor/check-circle.svg';
import { type Accessor, createEffect, createMemo, type JSX } from 'solid-js';
import { useSoupEntityActions } from '../actions/use-soup-entity-actions';
import { useSoupView } from '../context';
import { SoupEntityRow } from './soup-entity-row';

export type SoupEntityListItemRenderProps = {
  entity: SoupEntityItem['entity'];
  timestamp: SoupEntityItem['entity']['updatedAt'];
  highlighted: boolean;
  checked: boolean;
  showUnrollNotifications: boolean;
  entityRowConfig?: EntityRowConfig;
  onMouseMove: () => void;
  onChecked: (selected: boolean, shiftKey: boolean) => void;
  onClick: (event: MouseEvent) => void;
  onProjectClick: (project: ProjectEntity, event: MouseEvent) => void;
  onContentHitClick: (event: MouseEvent, location?: SearchLocation) => void;
};

type SoupActivationMetadata = {
  event?: MouseEvent | PointerEvent;
  location?: SearchLocation;
  project?: ProjectEntity;
  navigateChannelTarget?: boolean;
  openInNewSplit?: boolean;
};

type SoupEntityClickDependencies = {
  item: Accessor<SoupEntityItem>;
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
  item: Accessor<SoupEntityItem>;
  children: (props: SoupEntityListItemRenderProps) => JSX.Element;
  hoverFocus?: boolean | Accessor<boolean>;
  onActivate?: (activation: ListActivation<SoupItem>) => void;
}) {
  const panel = useSplitPanelOrThrow();
  const orchestrator = useGlobalBlockOrchestrator();
  const collection = useSoupCollection();
  const view = useSoupView();
  const entityActions = useSoupEntityActions();
  const { state: listState } = useList<SoupItem>();
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

  const markDoneAction = () =>
    entityActions
      .build([props.item().entity])
      .find((action) => action.id === 'mark-done');
  const timestamp = (sort: SoupCollectionSort | undefined) => {
    const entity = props.item().entity;
    switch (sort?.id) {
      case 'created_at':
        return entity.createdAt;
      case 'viewed_at':
        return entity.viewedAt ?? entity.updatedAt ?? entity.createdAt;
      case 'viewed_updated':
        return entity.sortTs ?? entity.updatedAt ?? entity.createdAt;
      default:
        return entity.updatedAt ?? entity.createdAt;
    }
  };

  const activate = (metadata: SoupActivationMetadata) => {
    const item = props.item();
    const activation: ListActivation<SoupItem> = {
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
      referredFrom: view.view(),
      location,
      openInNewSplit:
        metadata.openInNewSplit ?? metadata.event?.shiftKey ?? false,
    });
  };

  return (
    <List.Item item={props.item()}>
      {(state) => (
        <SoupEntityRow
          item={props.item()}
          selectedEntities={selectedEntities}
          isSelected={state.selected}
          onOpen={() => state.focus({ reason: 'pointer' })}
          onLongPress={() => {
            state.focus({ reason: 'pointer' });
            setItemSelected(!state.selected(), false);
          }}
        >
          {props.children({
            get entity() {
              return props.item().entity;
            },
            get timestamp() {
              return timestamp(collection.sort()[0]);
            },
            get highlighted() {
              return state.focused();
            },
            get checked() {
              return state.selected();
            },
            onMouseMove: () => {
              if (isKeypressActive() || view.previewOpen() || !hoverFocus())
                return;
              state.focus({ reason: 'hover' });
            },
            get showUnrollNotifications() {
              return (
                props.item().entity.type !== 'email' &&
                collection.facets.has('focus', 'inbox') &&
                !collection.facets.has('focus', 'noise')
              );
            },
            get entityRowConfig() {
              return markDoneAction()
                ? {
                    swipeLeftColor: 'bg-success-surface',
                    swipeLeftRevealedComponent: (
                      <CheckCircleIcon class="size-5 text-ink" />
                    ),
                  }
                : undefined;
            },
            onChecked: setItemSelected,
            onClick: (event) =>
              handleSoupEntityClick(
                {
                  item: props.item,
                  state,
                  previewPaneVisible: view.previewPaneVisible,
                  activate,
                },
                event
              ),
            onProjectClick: (project, event) => activate({ event, project }),
            onContentHitClick: (event, location) =>
              activate({ event, location }),
          })}
        </SoupEntityRow>
      )}
    </List.Item>
  );
}
