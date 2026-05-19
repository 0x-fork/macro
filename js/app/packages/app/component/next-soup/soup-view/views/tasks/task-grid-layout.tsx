import { Modals } from '@core/component/Properties/component/modal';
import { PropertyValueIcon } from '@core/component/Properties/component/propertyValue/PropertyValueIcon';
import { SYSTEM_PROPERTY_IDS } from '@core/component/Properties/constants';
import {
  PropertiesProvider,
  type PropertySaveHandler,
} from '@core/component/Properties/context/PropertiesContext';
import type {
  Property,
  PropertyApiValues,
} from '@core/component/Properties/types';
import { UserGroup } from '@core/component/UserGroup';
import { UserIcon } from '@core/component/UserIcon';
import { isMobile } from '@core/mobile/isMobile';
import { tryMacroId, useDisplayName, useDisplayNameParts } from '@core/user';
import {
  DisplayName,
  Entity,
  type EntityData,
  type EntityWithProperties,
  isProjectContainedEntity,
  MultiSelectCheckbox,
  ProjectBreadCrumb,
  TaskPropertyGroup,
  TaskPropertyPill,
  UnreadIndicator,
  useTaskAssignees,
  useTaskPriority,
  useTaskStatus,
} from '@entity';
import type { LayoutProps } from '@entity/composed/list-entity/shared';
import { soupPropertyToProperty } from '@entity/extractors-property';
import { HexDashedIcon } from '@icon/HexDashedIcon';
import CheckIcon from '@phosphor-icons/core/bold/check-bold.svg?component-solid';
import UserFillIcon from '@phosphor-icons/core/fill/user-fill.svg?component-solid';
import UsersIcon from '@phosphor-icons/core/fill/users-fill.svg?component-solid';
import { useUserId } from '@queries/auth';
import { useBulkSaveEntityPropertiesMutation } from '@queries/properties/entity';
import { EntityType } from '@service-properties/generated/schemas/entityType';
import { Tooltip } from '@ui';
import { cn } from '@ui/utils/classname';
import { createMemo, Show, Suspense } from 'solid-js';
import {
  TASK_GRID_TEMPLATE_AREAS_WIDE,
  TASK_GRID_TEMPLATE_COLUMNS_WIDE,
} from './task-grid-template';

function SharedIndicator(props: { ownerId: string }) {
  const [displayName] = useDisplayName(tryMacroId(props.ownerId));
  return (
    <Tooltip label={`${displayName() || 'User'} shared this`}>
      <UsersIcon class="size-3.5 text-ink-muted opacity-70 shrink-0" />
    </Tooltip>
  );
}

export function TaskGridLayout(props: LayoutProps) {
  const currentId = useUserId();
  const entity = () => props.entity as EntityWithProperties<EntityData>;
  const isShared = () => props.entity.ownerId !== currentId();

  const ownerNameParts = () =>
    useDisplayNameParts(tryMacroId(props.entity.ownerId));
  const ownerDisplayName = () =>
    isShared() ? ownerNameParts().firstName() || 'Unknown' : 'Me';

  const taskPriority = useTaskPriority(entity());
  const taskAssignees = useTaskAssignees(entity());

  const properties = createMemo((): Property[] => {
    const soupProperties = entity().properties ?? [];
    return soupProperties
      .map(soupPropertyToProperty)
      .filter((p) =>
        [
          SYSTEM_PROPERTY_IDS.STATUS,
          SYSTEM_PROPERTY_IDS.PRIORITY,
          SYSTEM_PROPERTY_IDS.ASSIGNEES,
        ].includes(p.propertyDefinitionId as typeof SYSTEM_PROPERTY_IDS.STATUS)
      );
  });

  const saveMutation = useBulkSaveEntityPropertiesMutation();

  const saveOne = (property: Property, apiValues: PropertyApiValues) =>
    saveMutation.mutateAsync({
      properties: [
        {
          entityId: props.entity.id,
          entityType: EntityType.TASK,
          property,
          apiValues,
        },
      ],
    });

  const saveHandler: PropertySaveHandler = {
    saveProperty: (property, value) => saveOne(property, value),
    saveDate: (property, date) =>
      saveOne(property, { valueType: 'DATE', value: date }),
  };

  return (
    <PropertiesProvider
      entityType={EntityType.TASK}
      canEdit={true}
      properties={properties}
      onRefresh={() => {}}
      onPropertyAdded={() => {}}
      onPropertyDeleted={() => {}}
      saveHandler={saveHandler}
    >
      <Entity.Layout
        class={cn(
          'task-grid-row w-full min-h-[inherit] items-center text-sm px-2',
          'gap-2 grid grid-rows-[1fr]'
        )}
        style={{
          'grid-template-columns': TASK_GRID_TEMPLATE_COLUMNS_WIDE,
          'grid-template-areas': TASK_GRID_TEMPLATE_AREAS_WIDE,
        }}
      >
        <Entity.Slot
          placement="indicator"
          class="self-center size-4 flex items-center justify-center relative group"
        >
          <UnreadIndicator
            active={props.unread}
            class={cn(props.checked && 'opacity-0', 'group-hover:opacity-0')}
          />
          <div
            class={cn(
              'absolute inset-0 flex items-center justify-center',
              props.checked
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'
            )}
          >
            <MultiSelectCheckbox
              checked={props.checked}
              onChecked={props.onChecked}
            />
          </div>
        </Entity.Slot>

        <Entity.Slot
          placement="content"
          class="ph-no-capture items-center gap-1.5 flex min-w-0"
        >
          <div class="shrink-0 flex items-center [&_svg]:size-4">
            <TaskPropertyGroup
              entity={entity()}
              include={[SYSTEM_PROPERTY_IDS.STATUS]}
            />
            <Show
              when={
                !entity().properties?.some(
                  (p) => p.definition.id === SYSTEM_PROPERTY_IDS.STATUS
                )
              }
            >
              <HexDashedIcon class="size-4 text-ink-extra-muted" />
            </Show>
          </div>
          <span class="ph-no-capture text-sm truncate min-w-0">
            <Entity.Title entity={props.entity} />
          </span>
          <Show when={isProjectContainedEntity(props.entity) && props.entity}>
            {(entity) => (
              <span class="ph-no-capture flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-edge-muted bg-surface text-ink-muted text-xs truncate max-w-full">
                <ProjectBreadCrumb
                  entity={entity()}
                  onClick={props.onProjectClick}
                />
              </span>
            )}
          </Show>
          <Show when={isShared()}>
            <SharedIndicator ownerId={props.entity.ownerId} />
          </Show>
        </Entity.Slot>

        <Entity.Slot
          placement="priority"
          class="flex items-center min-w-0 overflow-hidden text-xs"
        >
          <Show
            when={taskPriority()?.id}
            fallback={<span class="w-3 h-px bg-edge-muted" />}
          >
            <TaskPropertyPill property={taskPriority()!.property}>
              <PropertyValueIcon
                optionId={taskPriority()!.id!}
                class="size-3 shrink-0"
              />
              <span class="truncate">{taskPriority()!.label}</span>
            </TaskPropertyPill>
          </Show>
        </Entity.Slot>

        <Entity.Slot
          placement="assignees"
          class="flex items-center min-w-0 overflow-hidden text-xs"
        >
          <Show
            when={taskAssignees()?.ids.length}
            fallback={<span class="w-3 h-px bg-edge-muted" />}
          >
            <TaskPropertyPill property={taskAssignees()!.property}>
              <UserGroup
                userIds={taskAssignees()!.ids}
                maxUsers={2}
                size="sm"
              />
              <span class="truncate">
                <Show when={taskAssignees()!.ids[0]} keyed>
                  {(firstId) => <AssigneeLabel id={firstId} />}
                </Show>
                <Show when={taskAssignees()!.ids.length > 1}>
                  <span class="text-ink-extra-muted">
                    {' '}
                    +{taskAssignees()!.ids.length - 1}
                  </span>
                </Show>
              </span>
            </TaskPropertyPill>
          </Show>
        </Entity.Slot>

        <Entity.Slot
          placement="createdBy"
          class="hidden @min-[1221px]/u-list:flex items-center min-w-0 overflow-hidden text-xs"
        >
          <TaskPropertyPill>
            <span class="size-4 shrink-0 rounded-full ring-1 ring-edge-muted overflow-hidden">
              <UserIcon
                id={props.entity.ownerId}
                size="sm"
                showTooltip={false}
              />
            </span>
            <span class="truncate text-ink-muted">{ownerDisplayName()}</span>
          </TaskPropertyPill>
        </Entity.Slot>

        <Entity.Slot
          placement="timestamp"
          class="text-xs text-right text-ink-extra-muted font-light whitespace-nowrap"
        >
          <Show when={!props.hasNotifications}>
            <Entity.Timestamp entity={props.entity} />
          </Show>
        </Entity.Slot>
      </Entity.Layout>
      <Suspense>
        <Modals />
      </Suspense>
    </PropertiesProvider>
  );
}

function AssigneeLabel(props: { id: string }) {
  const parts = useDisplayNameParts(tryMacroId(props.id));
  return <>{parts.firstName() || 'User'}</>;
}

/**
 * Narrow layout for tasks that mirrors NarrowTaskLayout in StackedListEntity:
 * status icon + title + timestamp on row 1, owner display on row 2, and the
 * task property pills (status, priority, assignees) on row 3.
 */
export function TaskNarrowLayout(props: LayoutProps) {
  const mobile = isMobile();
  const entity = () => props.entity as EntityWithProperties<EntityData>;

  const taskStatus = useTaskStatus(entity());
  const taskPriority = useTaskPriority(entity());
  const taskAssignees = useTaskAssignees(entity());

  const properties = createMemo((): Property[] => {
    const soupProperties = entity().properties ?? [];
    return soupProperties
      .map(soupPropertyToProperty)
      .filter((p) =>
        [
          SYSTEM_PROPERTY_IDS.STATUS,
          SYSTEM_PROPERTY_IDS.PRIORITY,
          SYSTEM_PROPERTY_IDS.ASSIGNEES,
        ].includes(p.propertyDefinitionId as typeof SYSTEM_PROPERTY_IDS.STATUS)
      );
  });

  const saveMutation = useBulkSaveEntityPropertiesMutation();

  const saveOne = (property: Property, apiValues: PropertyApiValues) =>
    saveMutation.mutateAsync({
      properties: [
        {
          entityId: props.entity.id,
          entityType: EntityType.TASK,
          property,
          apiValues,
        },
      ],
    });

  const saveHandler: PropertySaveHandler = {
    saveProperty: (property, value) => saveOne(property, value),
    saveDate: (property, date) =>
      saveOne(property, { valueType: 'DATE', value: date }),
  };

  const dim = () => !props.unread;

  return (
    <PropertiesProvider
      entityType={EntityType.TASK}
      canEdit={true}
      properties={properties}
      onRefresh={() => {}}
      onPropertyAdded={() => {}}
      onPropertyDeleted={() => {}}
      saveHandler={saveHandler}
    >
      <div
        class={cn(
          'grid w-full text-sm py-2 px-2',
          mobile && !props.hasNotifications && 'min-h-[4.5rem]'
        )}
        style={{
          'grid-template-columns': mobile ? '3rem 1fr' : '1.5rem 1fr',
          gap: '0 0.75rem',
        }}
      >
        <Show
          when={mobile}
          fallback={
            <div
              class="row-span-full flex justify-center relative group pt-1.5"
              style={{ 'grid-column': '1' }}
            >
              <UnreadIndicator
                active={props.unread}
                class={cn(
                  props.checked && 'opacity-0',
                  'group-hover:opacity-0'
                )}
              />
              <div
                class={cn(
                  'absolute inset-0 flex justify-center pt-1.5',
                  props.checked
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100'
                )}
              >
                <MultiSelectCheckbox
                  checked={props.checked}
                  onChecked={props.onChecked}
                />
              </div>
            </div>
          }
        >
          <div
            class={cn(
              'flex items-start justify-center',
              !props.hasNotifications && 'row-span-full'
            )}
            style={{ 'grid-column': '1' }}
          >
            <div class="relative flex">
              <button
                type="button"
                class={cn(
                  'size-10 rounded-md overflow-hidden transition-colors',
                  props.checked && 'ring-2 ring-accent'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onChecked?.(!props.checked, e.shiftKey);
                }}
              >
                <Show
                  when={props.checked}
                  fallback={
                    <UserIcon
                      id={props.entity.ownerId}
                      size="fill"
                      suppressClick
                    />
                  }
                >
                  <div class="size-full bg-accent grid place-items-center text-white">
                    <CheckIcon class="size-5" />
                  </div>
                </Show>
              </button>
              <Show when={props.isShared}>
                <div class="absolute -bottom-px -right-px rounded-sm bg-surface p-0.5">
                  <UsersIcon class="size-3 opacity-70" />
                </div>
              </Show>
            </div>
          </div>
        </Show>
        <div
          class={cn('flex flex-col gap-0.5 min-w-0 pt-1.5', {
            'opacity-80 font-normal': dim(),
            'font-semibold': props.unread,
          })}
          style={{ 'grid-column': '2' }}
        >
          <span class="flex items-center gap-2 min-w-0">
            <span class="flex items-center gap-1.5 min-w-0">
              <Show when={!mobile}>
                <span class="shrink-0 [&_svg]:size-4">
                  <Show
                    when={taskStatus()}
                    fallback={
                      <HexDashedIcon class="size-4 text-ink-extra-muted" />
                    }
                  >
                    <TaskPropertyGroup
                      entity={entity()}
                      include={[SYSTEM_PROPERTY_IDS.STATUS]}
                    />
                  </Show>
                </span>
              </Show>
              <span class="ph-no-capture text-sm truncate">
                <Entity.Title entity={props.entity} />
              </span>
            </span>
            <span class="ml-auto text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0">
              <Entity.Timestamp entity={props.entity} />
            </span>
          </span>
          <span class="text-sm text-ink-muted truncate min-h-[1.25rem]">
            <span class="flex items-center gap-1 text-xs text-ink/50">
              <Show
                when={props.isShared}
                fallback={
                  <>
                    <UserFillIcon class="size-3 shrink-0" />
                    <DisplayName id={props.entity.ownerId} />
                  </>
                }
              >
                <UsersIcon class="size-3 shrink-0" />
                <DisplayName id={props.entity.ownerId} />
              </Show>
            </span>
          </span>
          <div class="flex flex-wrap items-center justify-start gap-1.5 min-w-0">
            <Show when={isProjectContainedEntity(props.entity) && props.entity}>
              {(project) => (
                <TaskPropertyPill dim={dim()}>
                  <ProjectBreadCrumb
                    entity={project()}
                    onClick={props.onProjectClick}
                  />
                </TaskPropertyPill>
              )}
            </Show>
            <Show when={taskPriority()?.id}>
              <TaskPropertyPill property={taskPriority()!.property} dim={dim()}>
                <PropertyValueIcon
                  optionId={taskPriority()!.id!}
                  class="size-3 shrink-0"
                />
                <span class="truncate">{taskPriority()!.label}</span>
              </TaskPropertyPill>
            </Show>
            <Show when={taskAssignees()?.ids.length}>
              <TaskPropertyPill
                property={taskAssignees()!.property}
                dim={dim()}
              >
                <UserGroup
                  userIds={taskAssignees()!.ids}
                  maxUsers={3}
                  size="sm"
                />
                <span class="truncate">
                  <AssigneeLabel id={taskAssignees()!.ids[0]} />
                  <Show when={taskAssignees()!.ids.length > 1}>
                    <span class="text-ink-extra-muted">
                      {' '}
                      +{taskAssignees()!.ids.length - 1}
                    </span>
                  </Show>
                </span>
              </TaskPropertyPill>
            </Show>
          </div>
        </div>
      </div>
      <Suspense>
        <Modals />
      </Suspense>
    </PropertiesProvider>
  );
}
