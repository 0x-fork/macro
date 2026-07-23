import type { SoupGroupHeaderRow } from '@app/features/soup-list';
import { useSoupView } from '@app/features/soup-view/context';
import { useDealStages } from '@companies/crm/deal-stages';
import { CrmStageIcon } from '@companies/crm/StageIcon';
import { UserIcon } from '@core/component/UserIcon';
import { idToDisplayName } from '@core/user/util';
import CaretRightIcon from '@phosphor/caret-right.svg';
import CircleDashedIcon from '@phosphor/circle-dashed.svg';
import { PropertyValueIcon } from '@property/component/propertyValue/PropertyValueIcon';
import { PROPERTY_OPTION_IDS, SYSTEM_PROPERTY_IDS } from '@property/constants';
import { cn, Layer } from '@ui';
import { Match, Show, Switch } from 'solid-js';

const STATUS_TINTS: Record<string, string> = {
  [PROPERTY_OPTION_IDS.STATUS.NOT_STARTED]:
    'bg-task/5 border-task/10 hover:bg-task/10',
  [PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS]:
    'bg-alert/5 border-alert/10 hover:bg-alert/10',
  [PROPERTY_OPTION_IDS.STATUS.IN_REVIEW]:
    'bg-note/5 border-note/10 hover:bg-note/10',
  [PROPERTY_OPTION_IDS.STATUS.COMPLETED]:
    'bg-accent/5 border-accent/10 hover:bg-accent/10',
  [PROPERTY_OPTION_IDS.STATUS.CANCELED]:
    'bg-ink/5 border-ink/10 hover:bg-ink/10',
};

export function SoupGroupHeader(props: {
  item: SoupGroupHeaderRow;
  focused: boolean;
}) {
  const { collection } = useSoupView();
  const dealStages = useDealStages();
  const field = collection.groupByField;
  const expanded = () =>
    collection.collapsedGroups.isExpanded(props.item.groupId);
  const propertyId = () => {
    const current = field();
    return current?.type === 'property'
      ? current.propertyDefinitionId
      : undefined;
  };
  const isDate = () => collection.state.groupBy === 'date';
  const isPerson = () =>
    propertyId() === SYSTEM_PROPERTY_IDS.ASSIGNEES ||
    propertyId() === SYSTEM_PROPERTY_IDS.COMPANY_OWNER;
  const stageIndex = () =>
    propertyId() === SYSTEM_PROPERTY_IDS.STAGE
      ? dealStages
          .filterStages()
          .findIndex((stage) => stage.id === props.item.groupId)
      : -1;
  const tint = () =>
    propertyId() === SYSTEM_PROPERTY_IDS.STATUS
      ? STATUS_TINTS[props.item.groupId]
      : undefined;

  return (
    <Layer depth={2}>
      <button
        type="button"
        class={cn(
          'group/header relative mx-1 my-0.5 flex min-h-9 w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-lg border border-edge-muted bg-surface px-2 py-1.5 text-left text-xs font-semibold tracking-tight text-text-muted hover:bg-active',
          props.focused && 'bg-active',
          tint()
        )}
        onClick={() => collection.collapsedGroups.toggle(props.item.groupId)}
      >
        <Layer depth={3}>
          <div class="flex size-4.5 items-center justify-center rounded-xs group-hover/header:bg-ink/5">
            <CaretRightIcon class={cn('size-2.5', expanded() && 'rotate-90')} />
          </div>
        </Layer>
        <Switch>
          <Match when={!props.item.groupId}>
            <CircleDashedIcon class="size-3.5 text-ink-extra-muted" />
            <span class="truncate">{props.item.label}</span>
          </Match>
          <Match when={isPerson()}>
            <UserIcon
              id={props.item.groupId}
              size="sm"
              suppressClick
              showTooltip={false}
            />
            <span class="truncate">
              {idToDisplayName(props.item.groupId) || props.item.label}
            </span>
          </Match>
          <Match when={stageIndex() >= 0}>
            <CrmStageIcon
              optionId={props.item.groupId}
              index={stageIndex()}
              class="size-3.5"
            />
            <span class="truncate">{props.item.label}</span>
          </Match>
          <Match when={propertyId()}>
            <PropertyValueIcon optionId={props.item.groupId} class="size-3.5" />
            <span class="truncate">{props.item.label}</span>
          </Match>
          <Match when={true}>
            <span class="truncate">{props.item.label}</span>
          </Match>
        </Switch>
        <Show when={!isDate() && props.item.count !== undefined}>
          <span class="shrink-0 rounded-full bg-ink/10 px-1.5 py-px text-xs tabular-nums text-ink-extra-muted">
            {props.item.count}
          </span>
        </Show>
      </button>
    </Layer>
  );
}
