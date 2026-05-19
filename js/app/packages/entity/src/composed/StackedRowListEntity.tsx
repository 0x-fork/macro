import './ListEntity.css';
import { useSplitPanel } from '@app/component/split-layout/layoutUtils';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { twoLineClampMarkdownTheme } from '@core/component/LexicalMarkdown/theme';
import { Tooltip } from '@ui';
import { UserIcon } from '@core/component/UserIcon';
import { isMobile } from '@core/mobile/isMobile';
import { tryMacroId, useDisplayName, useDisplayNameParts } from '@core/user';
import type { DateValue } from '@core/util/date';
import { DisplayName } from '@entity/components/DisplayName';
import UsersIcon from '@phosphor-icons/core/fill/users-fill.svg?component-solid';
import UserFillIcon from '@phosphor-icons/core/fill/user-fill.svg?component-solid';
import CalendarBlankIcon from '@phosphor-icons/core/bold/calendar-blank-bold.svg';
import EnvelopeOpenIcon from '@phosphor/envelope-open.svg';
import FileDashedIcon from '@phosphor/file-dashed.svg';
import PhoneXIcon from '@phosphor-icons/core/bold/phone-x-bold.svg';
import CheckIcon from '@phosphor-icons/core/bold/check-bold.svg';
import type { StreamEvent } from '@service-connection/generated/schemas';
import {
  getStreamState,
  subscribeToStreamState,
} from '@service-connection/stream-events';
import { mergeRefs } from '@solid-primitives/refs';
import { cn } from '@ui/utils/classname';
import {
  createMemo,
  For,
  type JSX,
  Match,
  type Ref,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import { MultiSelectCheckbox } from '../components/MultiSelectCheckbox';
import { ProjectBreadCrumb } from '../components/ProjectBreadCrumb';
import { UnreadIndicator } from '../components/UnreadIndicator';
import { Entity } from '../entity';
import type { EntityRowConfig } from '../extractors-notification';
import {
  PropertiesProvider,
  type PropertySaveHandler,
} from '@core/component/Properties/context/PropertiesContext';
import { Modals } from '@core/component/Properties/component/modal';
import type {
  Property,
  PropertyApiValues,
} from '@core/component/Properties/types';
import {
  SYSTEM_PROPERTY_IDS,
  PROPERTY_OPTION_IDS,
} from '@core/component/Properties/constants';
import { PropertyValueIcon } from '@core/component/Properties/component/propertyValue/PropertyValueIcon';
import { HexDashedIcon } from '@icon/HexDashedIcon';
import { formatPropertyValue } from '@core/component/Properties/utils/formatting';
import { EntityType } from '@service-properties/generated/schemas/entityType';
import { useBulkSaveEntityPropertiesMutation } from '@queries/properties/entity';
import { soupPropertyToProperty } from '../extractors-property/property-helpers';
import type { EntityWithProperties } from '../types/entity';
import {
  type AutomationEntity,
  type CallEntity,
  type ChannelEntity,
  type ChannelMessageEntity,
  type ChatEntity,
  type DocumentEntity,
  type EmailEntity,
  type EntityData,
  type TaskEntity,
  isCallEntity,
  isChannelEntity,
  isChannelMessageEntity,
  isChatEntity,
  isDocumentEntity,
  isEmailEntity,
  isProjectContainedEntity,
  isAutomationEntity,
  isTaskEntity,
  type ProjectEntity,
} from '../types/entity';
import {
  isWithNotification,
  type WithNotification,
} from '../types/notification';
import type { SearchLocation } from '../types/search';
import { isSearchEntity } from '../types/search';
import { createEntityDraggable } from '../utils/draggable';
import { unreadFilterFn } from '../utils/filter';
import {
  filterNotDoneNotifications,
  filterValidNotifications,
} from '../utils/notification';
import { useIsShared } from '../utils/shared';
import { formatDateAndTime } from '../utils/timestamp';
import { formatCallDuration } from '@block-call/utils';
import { useListLayout } from './ListEntity';
import { TaskPropertyGroup, TaskPropertyPill } from './StackedListEntity';

interface StackedRowListEntityProps {
  entity: WithNotification<EntityData>;
  onClick?: (event: MouseEvent) => void;
  timestamp?: DateValue | null;
  ref?: Ref<HTMLDivElement>;
  checked?: boolean;
  highlighted?: boolean;
  hovered?: boolean;
  hideContentHits?: boolean;
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
  onMouseMove?: () => void;
  showUnrollNotifications?: boolean;
  dimWhenRead?: boolean;
  onProjectClick?: (
    entity: ProjectEntity,
    e: PointerEvent | MouseEvent
  ) => void;
  onContentHitClick?: (
    e: PointerEvent | MouseEvent,
    location?: SearchLocation
  ) => void;
  entityRowConfig?: EntityRowConfig;
}

interface BaseLayoutProps {
  entity: WithNotification<EntityData>;
  checked?: boolean;
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
  unread: boolean;
  isShared: boolean;
  hasNotifications: boolean;
  dimWhenRead?: boolean;
  streamState?: StreamEvent;
  onProjectClick?: (
    entity: ProjectEntity,
    e: PointerEvent | MouseEvent
  ) => void;
}

const STATUS_TO_COLOR: Record<string, string> = {
  [PROPERTY_OPTION_IDS.STATUS.NOT_STARTED]: 'text-task',
  [PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS]: 'text-alert-ink',
  [PROPERTY_OPTION_IDS.STATUS.IN_REVIEW]: 'text-note',
  [PROPERTY_OPTION_IDS.STATUS.COMPLETED]: 'text-accent',
  [PROPERTY_OPTION_IDS.STATUS.CANCELED]: 'text-ink-muted',
};

function RowShell(props: {
  checked?: boolean;
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
  unread: boolean;
  dimWhenRead?: boolean;
  icon: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <div
      class="grid w-full text-sm py-2.5 px-2 items-start"
      style={{
        'grid-template-columns': '1.5rem 1fr',
        gap: '0 0.5rem',
      }}
    >
      <div class="self-start size-4 flex items-center justify-center relative group mt-0.5">
        <UnreadIndicator
          active={props.unread}
          class={cn(props.checked && 'opacity-0', 'group-hover:opacity-0')}
        />
        <div
          class={cn(
            'absolute inset-0 flex items-center justify-center',
            props.checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <MultiSelectCheckbox
            checked={props.checked}
            onChecked={props.onChecked}
          />
        </div>
      </div>
      <div
        class={cn('flex flex-col gap-1 min-w-0', {
          'opacity-70': props.dimWhenRead && !props.unread,
        })}
      >
        {props.children}
      </div>
    </div>
  );
}

function SharedIndicator(props: { ownerId: string }) {
  const [displayName] = useDisplayName(tryMacroId(props.ownerId));
  return (
    <Tooltip label={`${displayName() || 'User'} shared this`}>
      <UsersIcon class="size-3.5 text-ink-muted opacity-70 shrink-0" />
    </Tooltip>
  );
}

function MetaPill(props: { class?: string; dim?: boolean; children: JSX.Element }) {
  return (
    <span
      class={cn(
        'flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs whitespace-nowrap transition-colors',
        props.dim
          ? 'bg-surface border-edge-muted/50 text-ink-muted/70 hover:border-edge hover:bg-hover/50'
          : 'bg-surface border-edge-muted text-ink-muted hover:border-edge hover:bg-hover/50',
        props.class
      )}
    >
      {props.children}
    </span>
  );
}

function EmailRowLayout(props: BaseLayoutProps & { email: EmailEntity }) {
  const icon = (
    <Switch>
      <Match when={props.email.isDraft}>
        <FileDashedIcon class="size-4 text-ink-muted" />
      </Match>
      <Match when={props.email.hasIcsAttachment}>
        <CalendarBlankIcon class="size-4 text-ink-muted" />
      </Match>
      <Match when={!props.unread}>
        <EnvelopeOpenIcon class="size-4 text-ink-muted" />
      </Match>
      <Match when={true}>
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      </Match>
    </Switch>
  );

  return (
    <RowShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={icon}
    >
      {/* Row 1: From + timestamp */}
      <div class="flex items-center gap-2 min-w-0">
        <span class="[&_svg]:size-4 shrink-0">{icon}</span>
        <span
          class={cn(
            'ph-no-capture truncate min-w-0 flex-1',
            props.unread ? 'font-semibold' : 'font-medium'
          )}
        >
          <Entity.EmailParticipants entity={props.email} />
        </span>
        <Show when={props.isShared}>
          <SharedIndicator ownerId={props.entity.ownerId} />
        </Show>
        <span class="ml-auto text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
      {/* Row 2: Subject */}
      <div class="flex items-center gap-2 min-w-0">
        <span
          class={cn('truncate text-ink-muted', props.unread && 'text-ink')}
        >
          <Entity.Title entity={props.entity} />
        </span>
      </div>
      {/* Row 3: Snippet */}
      <Show when={props.email.snippet}>
        <div class="flex items-center gap-2 min-w-0">
          <span class="truncate text-xs text-ink-extra-muted">
            {props.email.snippet}
          </span>
        </div>
      </Show>
    </RowShell>
  );
}

function ChannelRowLayout(props: BaseLayoutProps & { channel: ChannelEntity }) {
  const senderName = props.channel.latestMessage?.senderId
    ? useDisplayNameParts(tryMacroId(props.channel.latestMessage.senderId))
    : undefined;

  return (
    <RowShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      }
    >
      {/* Row 1: Channel name + timestamp */}
      <div class="flex items-center gap-2 min-w-0">
        <span class="[&_svg]:size-4 shrink-0">
          <Show
            when={
              props.channel.channelType === 'direct_message' &&
              props.channel.participantIds?.[0]
            }
            fallback={
              <Entity.Icon
                entity={props.entity}
                streamState={props.streamState}
              />
            }
          >
            {(participantId) => <UserIcon id={participantId()} size="fill" class="size-4 rounded-full" />}
          </Show>
        </span>
        <span
          class={cn(
            'ph-no-capture truncate min-w-0 flex-1',
            props.unread ? 'font-semibold' : 'font-medium'
          )}
        >
          <Entity.Title entity={props.entity} />
        </span>
        <Show when={props.isShared}>
          <SharedIndicator ownerId={props.entity.ownerId} />
        </Show>
        <span class="ml-auto text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
      {/* Row 2: Latest message */}
      <Show when={!props.hasNotifications && props.channel.latestMessage}>
        {(msg) => (
          <div class="flex items-center gap-2 min-w-0">
            <Show when={msg().senderId}>
              {(id) => (
                <span class="flex items-center gap-1 text-ink-muted shrink-0">
                  <UserIcon id={id()} size="xs" />
                  <Show when={senderName?.firstName()}>
                    {(name) => (
                      <span class="text-xs">{name()}</span>
                    )}
                  </Show>
                </span>
              )}
            </Show>
            <span class="truncate min-w-0 text-ink-extra-muted text-xs">
              <Show
                when={msg().content?.trim()}
                fallback={<span class="italic">Attached Items</span>}
              >
                <StaticMarkdown
                  theme={twoLineClampMarkdownTheme}
                  markdown={msg().content.trim()}
                  singleLine
                />
              </Show>
            </span>
          </div>
        )}
      </Show>
    </RowShell>
  );
}

function ChannelMessageRowLayout(
  props: BaseLayoutProps & { message: ChannelMessageEntity }
) {
  return (
    <RowShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      }
    >
      {/* Row 1: Channel + sender + timestamp */}
      <div class="flex items-center gap-2 min-w-0">
        <span class="[&_svg]:size-4 shrink-0">
          <Entity.Icon entity={props.entity} streamState={props.streamState} />
        </span>
        <span class="text-ink-muted text-xs shrink-0">
          {props.message.channelName}
        </span>
        <Show when={props.message.senderId}>
          {(id) => (
            <span class="flex items-center gap-1 shrink-0">
              <UserIcon id={id()} size="xs" />
              <span class="ph-no-capture text-xs font-medium">
                <DisplayName id={id()} format="firstName" />
              </span>
            </span>
          )}
        </Show>
        <span class="ml-auto text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
      {/* Row 2: Message content */}
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-ink-muted truncate min-w-0">
          {props.message.content}
        </span>
      </div>
    </RowShell>
  );
}

function useTaskStatus(entity: EntityWithProperties<EntityData>) {
  return createMemo(() => {
    const soupProperties = entity.properties ?? [];
    const statusProp = soupProperties
      .map(soupPropertyToProperty)
      .find((p) => p.propertyDefinitionId === SYSTEM_PROPERTY_IDS.STATUS);
    if (!statusProp || statusProp.valueType !== 'SELECT_STRING') return null;
    const optionId = statusProp.value?.[0];
    if (!optionId) return null;
    return {
      property: statusProp,
      optionId,
      color: STATUS_TO_COLOR[optionId] ?? 'text-task',
      label: formatPropertyValue(statusProp, optionId),
    };
  });
}

function useTaskPriority(entity: EntityWithProperties<EntityData>) {
  return createMemo(() => {
    const soupProperties = entity.properties ?? [];
    const prop = soupProperties
      .map(soupPropertyToProperty)
      .find((p) => p.propertyDefinitionId === SYSTEM_PROPERTY_IDS.PRIORITY);
    if (!prop || prop.valueType !== 'SELECT_STRING') return null;
    const selectedId = prop.value?.[0];
    if (!selectedId) return { property: prop, id: null, label: null };
    const label = formatPropertyValue(prop, selectedId);
    return { property: prop, id: selectedId, label };
  });
}

function useTaskAssignees(entity: EntityWithProperties<EntityData>) {
  return createMemo(() => {
    const soupProperties = entity.properties ?? [];
    const prop = soupProperties
      .map(soupPropertyToProperty)
      .find((p) => p.propertyDefinitionId === SYSTEM_PROPERTY_IDS.ASSIGNEES);
    if (!prop || prop.valueType !== 'ENTITY') return null;
    const ids = prop.value?.map((e) => e.entity_id) ?? [];
    return { property: prop, ids };
  });
}

function TaskRowLayout(props: BaseLayoutProps & { task: TaskEntity }) {
  const taskStatus = useTaskStatus(
    props.entity as EntityWithProperties<EntityData>
  );
  const taskPriority = useTaskPriority(
    props.entity as EntityWithProperties<EntityData>
  );
  const taskAssignees = useTaskAssignees(
    props.entity as EntityWithProperties<EntityData>
  );

  const properties = createMemo((): Property[] => {
    const soupProperties =
      (props.entity as EntityWithProperties<EntityData>).properties ?? [];
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
      <RowShell
        checked={props.checked}
        onChecked={props.onChecked}
        unread={props.unread}
        dimWhenRead={props.dimWhenRead ?? true}
        icon={
          <Show
            when={taskStatus()}
            fallback={<HexDashedIcon class="size-4 text-ink-extra-muted" />}
          >
            <TaskPropertyGroup
              entity={props.entity}
              include={[SYSTEM_PROPERTY_IDS.STATUS]}
            />
          </Show>
        }
      >
        {/* Row 1: Title + timestamp */}
        <div class="flex items-center gap-2 min-w-0">
          <span class="[&_svg]:size-4 shrink-0">
            <Show
              when={taskStatus()}
              fallback={<HexDashedIcon class="size-4 text-ink-extra-muted" />}
            >
              <TaskPropertyGroup
                entity={props.entity}
                include={[SYSTEM_PROPERTY_IDS.STATUS]}
              />
            </Show>
          </span>
          <span
            class={cn(
              'ph-no-capture truncate',
              props.unread ? 'font-semibold' : 'font-medium'
            )}
          >
            <Entity.Title entity={props.entity} />
          </span>
          <Show when={props.isShared}>
            <SharedIndicator ownerId={props.entity.ownerId} />
          </Show>
          <span class="ml-auto text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0">
            <Entity.Timestamp entity={props.entity} />
          </span>
        </div>
        {/* Row 2: Owner */}
        <div class="flex items-center gap-1 text-xs text-ink-muted min-w-0">
          <UserFillIcon class="size-3 shrink-0" />
          <DisplayName id={props.entity.ownerId} />
        </div>
        {/* Row 3: Properties as pills */}
        <div class="flex flex-wrap items-center gap-1.5 min-w-0">
          <Show
            when={isProjectContainedEntity(props.entity) && props.entity}
          >
            {(entity) => (
              <MetaPill>
                <ProjectBreadCrumb
                  entity={entity()}
                  onClick={props.onProjectClick}
                />
              </MetaPill>
            )}
          </Show>
          <Show when={taskPriority()?.id}>
            <TaskPropertyPill property={taskPriority()!.property}>
              <PropertyValueIcon
                optionId={taskPriority()!.id!}
                class="size-3"
              />
              <span>{taskPriority()!.label}</span>
            </TaskPropertyPill>
          </Show>
          <Show when={taskAssignees()?.ids.length}>
            <TaskPropertyPill property={taskAssignees()!.property}>
              <div class="flex items-center shrink-0">
                <For each={taskAssignees()!.ids.slice(0, 2)}>
                  {(id, index) => (
                    <span
                      class={cn(
                        'size-4 shrink-0 rounded-full ring-1 ring-edge-muted overflow-hidden',
                        index() > 0 && '-ml-1.5'
                      )}
                    >
                      <UserIcon id={id} size="fill" />
                    </span>
                  )}
                </For>
                <Show when={taskAssignees()!.ids.length > 2}>
                  <span class="-ml-1.5 size-4 shrink-0 flex items-center justify-center rounded-full bg-surface text-ink-muted text-[9px] font-medium ring-1 ring-edge-muted">
                    +{taskAssignees()!.ids.length - 2}
                  </span>
                </Show>
              </div>
              <span class="truncate">
                <DisplayName
                  id={taskAssignees()!.ids[0]}
                  format="firstName"
                />
                <Show when={taskAssignees()!.ids.length > 1}>
                  <span class="text-ink-extra-muted">
                    {' '}+{taskAssignees()!.ids.length - 1}
                  </span>
                </Show>
              </span>
            </TaskPropertyPill>
          </Show>
        </div>
      </RowShell>
      <Suspense>
        <Modals />
      </Suspense>
    </PropertiesProvider>
  );
}

function CallRowLayout(props: BaseLayoutProps & { call: CallEntity }) {
  const maxParticipants = 3;
  const participants = () =>
    props.call.participantIds?.slice(0, maxParticipants) ?? [];
  const extraCount = () =>
    Math.max(0, (props.call.participantIds?.length ?? 0) - maxParticipants);
  const showMissedIcon = () => !props.call.attended && !props.call.isActive;

  return (
    <RowShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={
        <Show
          when={showMissedIcon()}
          fallback={
            <Entity.Icon
              entity={props.entity}
              streamState={props.streamState}
            />
          }
        >
          <PhoneXIcon class="size-4 text-failure" />
        </Show>
      }
    >
      {/* Row 1: Call name + timestamp */}
      <div class="flex items-center gap-2 min-w-0">
        <span class="[&_svg]:size-4 shrink-0">
          <Show
            when={showMissedIcon()}
            fallback={
              <Entity.Icon
                entity={props.entity}
                streamState={props.streamState}
              />
            }
          >
            <PhoneXIcon class="size-4 text-failure" />
          </Show>
        </span>
        <span
          class={cn(
            'ph-no-capture truncate min-w-0 flex-1',
            props.unread ? 'font-semibold' : 'font-medium'
          )}
        >
          <Entity.Title entity={props.entity} />
        </span>
        <span class="ml-auto text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
      {/* Row 2: Duration + channel */}
      <div class="flex items-center gap-2 min-w-0 text-xs text-ink-muted">
        <Show
          when={props.call.durationMs}
          fallback={
            props.call.isActive ? (
              <span class="text-accent flex items-center gap-1 shrink-0">
                <span class="size-1.5 animate-pulse rounded-full bg-accent" />
                Live
              </span>
            ) : (
              <span class="text-ink-extra-muted">No duration</span>
            )
          }
        >
          {(ms) => <span>{formatCallDuration(ms())}</span>}
        </Show>
        <Show when={props.call.channelName}>
          <span class="text-ink-extra-muted">•</span>
          <span class="truncate">in {props.call.channelName}</span>
        </Show>
      </div>
      {/* Row 3: Participants */}
      <Show when={participants().length > 0}>
        <div class="flex items-center gap-1.5 min-w-0">
          <div class="flex items-center shrink-0">
            <For each={participants()}>
              {(id, index) => (
                <span
                  class={cn(
                    'size-5 shrink-0 rounded-full ring-1 ring-edge-muted overflow-hidden',
                    index() > 0 && '-ml-2'
                  )}
                >
                  <UserIcon id={id} size="fill" />
                </span>
              )}
            </For>
            <Show when={extraCount() > 0}>
              <span class="-ml-2 size-5 shrink-0 flex items-center justify-center rounded-full bg-surface text-ink text-[10px] font-medium ring-1 ring-edge-muted">
                +{extraCount()}
              </span>
            </Show>
          </div>
          <span class="text-xs text-ink-muted">
            {participants().length + extraCount()} participants
          </span>
        </div>
      </Show>
    </RowShell>
  );
}

function AutomationRowLayout(
  props: BaseLayoutProps & { automation: AutomationEntity }
) {
  const statusText = () => {
    if (props.automation.isRunning) return 'Running';
    if (!props.automation.enabled) return 'Paused';
    if (props.automation.nextRunAt)
      return `Next: ${formatDateAndTime(props.automation.nextRunAt)}`;
    return 'Idle';
  };

  const isRunning = () => props.automation.isRunning;

  return (
    <RowShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      }
    >
      {/* Row 1: Name + timestamp */}
      <div class="flex items-center gap-2 min-w-0">
        <span class="[&_svg]:size-4 shrink-0">
          <Entity.Icon entity={props.entity} streamState={props.streamState} />
        </span>
        <span class="ph-no-capture truncate min-w-0 flex-1 font-medium">
          <Entity.Title entity={props.entity} />
        </span>
        <Show when={props.isShared}>
          <SharedIndicator ownerId={props.entity.ownerId} />
        </Show>
        <span class="ml-auto text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
      {/* Row 2: Owner */}
      <div class="flex items-center gap-1.5 text-xs text-ink-muted">
        <UserIcon id={props.entity.ownerId} size="xs" />
        <DisplayName id={props.entity.ownerId} format="firstName" />
      </div>
      {/* Row 3: Status */}
      <div class="flex items-center gap-2 min-w-0">
        <span
          class={cn(
            'flex items-center gap-1.5 px-1.5 py-0.5 rounded-full text-xs whitespace-nowrap',
            isRunning()
              ? 'bg-accent/10 text-accent'
              : 'bg-ink/5 text-ink-muted'
          )}
        >
          <Show when={isRunning()}>
            <span class="size-1.5 animate-pulse rounded-full bg-accent" />
          </Show>
          {statusText()}
        </span>
      </div>
    </RowShell>
  );
}

function DocumentRowLayout(
  props: BaseLayoutProps & { document: DocumentEntity }
) {
  return (
    <RowShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      }
    >
      {/* Row 1: Title + timestamp */}
      <div class="flex items-center gap-2 min-w-0">
        <span class="[&_svg]:size-4 shrink-0">
          <Entity.Icon entity={props.entity} streamState={props.streamState} />
        </span>
        <span
          class={cn(
            'ph-no-capture truncate min-w-0 flex-1',
            props.unread ? 'font-semibold' : 'font-medium'
          )}
        >
          <Entity.Title entity={props.entity} />
        </span>
        <Show when={props.isShared}>
          <SharedIndicator ownerId={props.entity.ownerId} />
        </Show>
        <span class="ml-auto text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
      {/* Row 2: Owner */}
      <div class="flex items-center gap-1 text-xs text-ink-muted">
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
      </div>
      {/* Row 3: Folder */}
      <Show when={isProjectContainedEntity(props.entity) && props.entity}>
        {(entity) => (
          <div class="flex items-center gap-1.5 min-w-0">
            <MetaPill>
              <ProjectBreadCrumb
                entity={entity()}
                onClick={props.onProjectClick}
              />
            </MetaPill>
          </div>
        )}
      </Show>
    </RowShell>
  );
}

function ChatRowLayout(props: BaseLayoutProps & { chat: ChatEntity }) {
  return (
    <RowShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      }
    >
      {/* Row 1: Title + timestamp */}
      <div class="flex items-center gap-2 min-w-0">
        <span class="[&_svg]:size-4 shrink-0">
          <Entity.Icon entity={props.entity} streamState={props.streamState} />
        </span>
        <span
          class={cn(
            'ph-no-capture truncate min-w-0 flex-1',
            props.unread ? 'font-semibold' : 'font-medium'
          )}
        >
          <Entity.Title entity={props.entity} />
        </span>
        <Show when={props.isShared}>
          <SharedIndicator ownerId={props.entity.ownerId} />
        </Show>
        <span class="ml-auto text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
      {/* Row 2: Owner */}
      <div class="flex items-center gap-1 text-xs text-ink-muted">
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
      </div>
    </RowShell>
  );
}

function DefaultRowLayout(props: BaseLayoutProps) {
  return (
    <RowShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      }
    >
      {/* Row 1: Title + timestamp */}
      <div class="flex items-center gap-2 min-w-0">
        <span class="[&_svg]:size-4 shrink-0">
          <Entity.Icon entity={props.entity} streamState={props.streamState} />
        </span>
        <span class="ph-no-capture truncate min-w-0 flex-1 font-medium">
          <Entity.Title entity={props.entity} />
        </span>
        <Show when={props.isShared}>
          <SharedIndicator ownerId={props.entity.ownerId} />
        </Show>
        <span class="ml-auto text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
      {/* Row 2: Owner */}
      <div class="flex items-center gap-1 text-xs text-ink-muted">
        <UserFillIcon class="size-3 shrink-0" />
        <DisplayName id={props.entity.ownerId} />
      </div>
      {/* Row 3: Folder if applicable */}
      <Show when={isProjectContainedEntity(props.entity) && props.entity}>
        {(entity) => (
          <div class="flex items-center gap-1.5 min-w-0">
            <MetaPill>
              <ProjectBreadCrumb
                entity={entity()}
                onClick={props.onProjectClick}
              />
            </MetaPill>
          </div>
        )}
      </Show>
    </RowShell>
  );
}

export function StackedRowListEntity(props: StackedRowListEntityProps) {
  const unread = () => unreadFilterFn(props.entity);
  const isShared = useIsShared(props.entity);

  subscribeToStreamState(props.entity.id, props.entity.type);
  const streamState = getStreamState(props.entity.id);

  const hasNotifications = () => {
    if (!props.showUnrollNotifications) return false;
    if (!isWithNotification(props.entity)) return false;
    return (
      filterNotDoneNotifications(
        filterValidNotifications(props.entity.notifications?.())
      ).length > 0
    );
  };

  const showContentHits = () =>
    !props.hideContentHits &&
    isSearchEntity(props.entity) &&
    !!props.entity.search.contentHitData?.length;

  const baseProps = (): BaseLayoutProps => ({
    entity: props.entity,
    checked: props.checked,
    onChecked: props.onChecked,
    unread: unread(),
    isShared: isShared(),
    hasNotifications: hasNotifications(),
    dimWhenRead: props.dimWhenRead,
    streamState: streamState(),
    onProjectClick: props.onProjectClick,
  });

  const draggable = createEntityDraggable({
    entity: props.entity,
    splitId: useSplitPanel()?.handle?.id,
  });

  return (
    <Entity.Root
      entity={props.entity}
      onClick={(e) => {
        if (e.metaKey && props.onChecked) {
          props.onChecked(!props.checked, e.shiftKey);
          return;
        }
        props.onClick?.(e);
      }}
      ref={mergeRefs(props.ref, draggable)}
      class={cn(
        'soup-stacked-entity w-full max-w-2xl relative group/stacked rounded-sm',
        hasNotifications()
          ? 'pt-2'
          : {
              'border-b border-edge-muted': isMobile(),
              'bg-accent/10':
                props.checked || (props.highlighted && !isMobile()),
              'hover:bg-ink/5':
                !props.checked && !props.highlighted && !props.hovered,
              'bg-ink/5': props.hovered && !props.highlighted && !props.checked,
            }
      )}
      onMouseMove={props.onMouseMove}
    >
      <div
        class={cn(
          'absolute h-full w-[2px] left-0 top-0 bg-accent rounded-r-full opacity-0 transition-opacity',
          {
            'opacity-100': props.highlighted && !isMobile(),
          }
        )}
      />

      <Switch fallback={<DefaultRowLayout {...baseProps()} />}>
        <Match when={isEmailEntity(props.entity) && props.entity}>
          {(email) => <EmailRowLayout {...baseProps()} email={email()} />}
        </Match>
        <Match when={isChannelMessageEntity(props.entity) && props.entity}>
          {(message) => (
            <ChannelMessageRowLayout {...baseProps()} message={message()} />
          )}
        </Match>
        <Match when={isChannelEntity(props.entity) && props.entity}>
          {(channel) => (
            <ChannelRowLayout {...baseProps()} channel={channel()} />
          )}
        </Match>
        <Match when={isTaskEntity(props.entity) && props.entity}>
          {(task) => <TaskRowLayout {...baseProps()} task={task()} />}
        </Match>
        <Match when={isCallEntity(props.entity) && props.entity}>
          {(call) => <CallRowLayout {...baseProps()} call={call()} />}
        </Match>
        <Match when={isAutomationEntity(props.entity) && props.entity}>
          {(automation) => (
            <AutomationRowLayout {...baseProps()} automation={automation()} />
          )}
        </Match>
        <Match when={isDocumentEntity(props.entity) && props.entity}>
          {(document) => (
            <DocumentRowLayout {...baseProps()} document={document()} />
          )}
        </Match>
        <Match when={isChatEntity(props.entity) && props.entity}>
          {(chat) => <ChatRowLayout {...baseProps()} chat={chat()} />}
        </Match>
      </Switch>

      <Show when={hasNotifications() && !isMobile()}>
        <div class="pl-2 pr-4 pb-2 pt-1">
          <Show when={isWithNotification(props.entity) && !showContentHits()}>
            <Entity.Notification.Stacks
              entity={props.entity}
              visibleCount={3}
              variant="timeline"
            />
          </Show>
        </div>
      </Show>

      <Show when={showContentHits()}>
        <div class="pl-[1.875rem] pr-2 pb-1.5">
          <Entity.Search.ContentHits
            entity={props.entity}
            onClick={props.onContentHitClick}
            visibleCount={0}
          />
        </div>
      </Show>
    </Entity.Root>
  );
}
