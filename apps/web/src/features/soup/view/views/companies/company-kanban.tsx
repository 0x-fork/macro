import { useList } from '@app/components/list';
import {
  getSoupRowEntities,
  type SoupRow,
} from '@app/features/soup/collection';
import { useSoupView } from '@app/features/soup/view/context';
import { useDealStages } from '@companies/crm/deal-stages';
import { CrmStageIcon } from '@companies/crm/StageIcon';
import {
  useClosedStageIds,
  useCrmPermissions,
} from '@companies/crm/team-crm-config';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { UserIcon } from '@core/component/UserIcon';
import {
  Entity,
  type EntityData,
  formatTimestamp,
  getCompanyOwnerId,
  isCrmCompanyEntity,
} from '@entity';
import CircleDashedIcon from '@phosphor/circle-dashed.svg';
import Spinner from '@phosphor/spinner.svg';
import { useBulkSaveEntityPropertiesMutation } from '@queries/properties/entity';
import { EntityType } from '@service-properties/generated/schemas/entityType';
import { createElementSize } from '@solid-primitives/resize-observer';
import { Button, cn, Layer } from '@ui';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { SoupEntityContextMenu } from '../../components/soup-entity-context-menu';
import {
  buildCompanyBoardColumns,
  canMoveCompanyFromStage,
  companyStageMutationValues,
  NO_STAGE_KEY,
} from './company-board-model';

const MIN_COLUMN_WIDTH = 224;
const COLUMN_GAP = 12;
const BOARD_PADDING_X = 24;

export function CompanyKanban(props: {
  onEntityClick: (entity: EntityData, event: MouseEvent) => void;
}) {
  const { collection } = useSoupView();
  const { dataSource } = useList<SoupRow>();
  const dealStages = useDealStages();
  const permissions = useCrmPermissions();
  const closedStages = useClosedStageIds(dealStages.stages);
  const save = useBulkSaveEntityPropertiesMutation();
  const [draggedId, setDraggedId] = createSignal<string>();
  const [dropTarget, setDropTarget] = createSignal<string>();
  const [scroll, setScroll] = createSignal<HTMLDivElement>();

  const companies = () =>
    getSoupRowEntities(dataSource.items()).filter(isCrmCompanyEntity);
  type Company = ReturnType<typeof companies>[number];
  const columns = createMemo(() =>
    buildCompanyBoardColumns<Company>({
      activeStages: dealStages.stages(),
      filterStages: dealStages.filterStages(),
      selectedStageIds: collection.facets.getSelected('company_stage'),
      entities: companies(),
      resolveStage: dealStages.resolveStage,
    })
  );

  const boardSize = createElementSize(scroll);
  const columnWidth = createMemo(() => {
    const width = boardSize.width;
    const count = columns().length;
    if (!width || count === 0) return undefined;
    const usable = width - BOARD_PADDING_X;
    const fit = Math.max(
      1,
      Math.min(
        count,
        Math.floor((usable + COLUMN_GAP) / (MIN_COLUMN_WIDTH + COLUMN_GAP))
      )
    );
    return Math.floor((usable - (fit - 1) * COLUMN_GAP) / fit);
  });

  const canDragFrom = (stage: string) =>
    canMoveCompanyFromStage({
      stage,
      canEditCrm: permissions.canEditCrm(),
      canMoveClosedDeals: permissions.canMoveClosedDeals(),
      closedStageIds: closedStages(),
    });

  const moveToStage = (entityId: string, stage: string) => {
    const entity = companies().find((company) => company.id === entityId);
    if (!entity) return;
    const previous = dealStages.resolveStage(entity) ?? NO_STAGE_KEY;
    if (previous === stage || !canDragFrom(previous)) return;

    save.mutate({
      properties: [
        {
          entityId,
          entityType: EntityType.COMPANY,
          property: dealStages.stageProperty(),
          apiValues: {
            valueType: 'SELECT_STRING',
            values: companyStageMutationValues(stage),
          },
        },
      ],
    });
  };

  return (
    <div class="relative size-full min-h-0 min-w-0">
      <div
        ref={setScroll}
        class="scrollbar-hidden size-full overflow-x-auto overflow-y-hidden"
      >
        <div class="flex h-full gap-3 p-3">
          <For each={columns()}>
            {(column, index) => (
              <div
                class={cn(
                  'flex h-full min-w-56 flex-1 flex-col rounded-lg border border-edge-muted bg-surface',
                  dropTarget() === column.key &&
                    draggedId() &&
                    'border-accent/50 bg-accent/5'
                )}
                style={
                  columnWidth() !== undefined
                    ? { width: `${columnWidth()}px`, flex: 'none' }
                    : undefined
                }
                onDragOver={(event) => {
                  if (!draggedId()) return;
                  event.preventDefault();
                  setDropTarget(column.key);
                }}
                onDragLeave={(event) => {
                  if (
                    event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget)
                  ) {
                    return;
                  }
                  if (dropTarget() === column.key) setDropTarget(undefined);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id =
                    draggedId() ?? event.dataTransfer?.getData('text/plain');
                  setDraggedId(undefined);
                  setDropTarget(undefined);
                  if (id) moveToStage(id, column.key);
                }}
              >
                <div class="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-ink-muted">
                  <Show
                    when={column.key}
                    fallback={
                      <CircleDashedIcon class="size-3.5 text-ink-extra-muted" />
                    }
                  >
                    <CrmStageIcon
                      optionId={column.key}
                      index={index()}
                      class="size-3.5"
                    />
                  </Show>
                  <span class="truncate">{column.label}</span>
                </div>
                <div class="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  <For each={column.entities}>
                    {(entity) => (
                      <div class="shrink-0">
                        <SoupEntityContextMenu
                          entity={entity}
                          selectedEntities={() => []}
                          isSelected={() => false}
                          onOpen={() => {}}
                        >
                          <CompanyCard
                            entity={entity}
                            draggable={canDragFrom(column.key)}
                            dragging={draggedId() === entity.id}
                            onClick={(event) =>
                              props.onEntityClick(entity, event)
                            }
                            onDragStart={(event) => {
                              event.dataTransfer?.setData(
                                'text/plain',
                                entity.id
                              );
                              if (event.dataTransfer) {
                                event.dataTransfer.effectAllowed = 'move';
                              }
                              setDraggedId(entity.id);
                            }}
                            onDragEnd={() => {
                              setDraggedId(undefined);
                              setDropTarget(undefined);
                            }}
                          />
                        </SoupEntityContextMenu>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
          <Show when={dataSource.hasMore()}>
            <div class="flex h-full w-56 shrink-0 items-center justify-center rounded-lg border border-dashed border-edge-muted">
              <Button
                variant="base"
                size="sm"
                depth={2}
                disabled={dataSource.isLoadingMore()}
                onClick={() => void dataSource.loadMore()}
              >
                <Show when={dataSource.isLoadingMore()}>
                  <Spinner class="size-3 animate-spin" />
                </Show>
                Load more companies
              </Button>
            </div>
          </Show>
        </div>
      </div>
      <CustomScrollbar
        scrollContainer={scroll}
        horizontal
        revealZone={48}
        gutterSize={20}
        watchContent
      />
    </div>
  );
}

function CompanyCard(props: {
  entity: EntityData;
  draggable: boolean;
  dragging: boolean;
  onClick: (event: MouseEvent) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
}) {
  const ownerId = () =>
    isCrmCompanyEntity(props.entity)
      ? getCompanyOwnerId(props.entity)
      : undefined;
  const primaryDomain = () =>
    isCrmCompanyEntity(props.entity)
      ? props.entity.domains[0]?.domain
      : undefined;
  return (
    <Layer depth={2}>
      <div
        draggable={props.draggable}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        onClick={props.onClick}
        class={cn(
          'flex flex-col gap-1.5 rounded-lg border border-edge-muted bg-panel p-2.5 text-sm transition-colors hover:border-edge hover:bg-active',
          props.dragging && 'opacity-40'
        )}
      >
        <div class="flex min-w-0 items-center gap-2">
          <div class="size-4 shrink-0">
            <Entity.Icon entity={props.entity} />
          </div>
          <span class="ph-no-capture min-w-0 truncate font-semibold">
            <Entity.Title entity={props.entity} />
          </span>
          <Show when={ownerId()}>
            {(id) => (
              <span class="ml-auto shrink-0">
                <UserIcon id={id()} size="sm" suppressClick />
              </span>
            )}
          </Show>
        </div>
        <div class="flex min-w-0 items-center gap-2 text-xs text-ink-extra-muted">
          <Show when={primaryDomain()}>
            {(domain) => <span class="min-w-0 truncate">{domain()}</span>}
          </Show>
          <Show when={props.entity.updatedAt}>
            {(timestamp) => (
              <span class="ml-auto shrink-0">
                {formatTimestamp(timestamp())}
              </span>
            )}
          </Show>
        </div>
      </div>
    </Layer>
  );
}
