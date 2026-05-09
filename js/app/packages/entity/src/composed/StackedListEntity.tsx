import './ListEntity.css';
import { useSplitPanel } from '@app/component/split-layout/layoutUtils';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { twoLineClampMarkdownTheme } from '@core/component/LexicalMarkdown/theme';
import { Tooltip } from '@core/component/Tooltip';
import { UserIcon } from '@core/component/UserIcon';
import { isMobile } from '@core/mobile/isMobile';
import { tryMacroId, useDisplayNameParts } from '@core/user';
import type { DateValue } from '@core/util/date';
import { DisplayName } from '@entity/components/DisplayName';
import ArrowDownLeftIcon from '@icon/regular/arrow-down-left.svg';
import UsersIcon from '@icon/fill/users-fill.svg';
import UserFillIcon from '@icon/fill/user-fill.svg';
import CalendarBlankIcon from '@phosphor-icons/core/bold/calendar-blank-bold.svg';
import EnvelopeOpenIcon from '@icon/regular/envelope-open.svg';
import FileDashedIcon from '@icon/regular/file-dashed.svg';
import PhoneXIcon from '@phosphor-icons/core/bold/phone-x-bold.svg';
import CheckIcon from '@phosphor-icons/core/bold/check-bold.svg';
import CircleDashedIcon from '@phosphor-icons/core/regular/circle-dashed.svg';
import ListChecksIcon from '@phosphor-icons/core/regular/list-checks.svg';
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
  Index,
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
import { PropertyValue } from '@core/component/Properties/component/propertyValue/PropertyValue';
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
import {
  TaskCircleIcon,
  type TaskStatus,
} from '@macro-icons/square/TaskCircleIcon';
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

interface StackedListEntityProps {
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
  /** Whether to dim read entities (default: true for emails/channels) */
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

function LayoutShell(props: {
  checked?: boolean;
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
  unread: boolean;
  dimWhenRead?: boolean;
  hasNotifications?: boolean;
  children: JSX.Element;
}) {
  return (
    <Show
      when={props.hasNotifications}
      fallback={
        <div
          class="grid w-full text-sm py-2 px-2 items-center"
          style={{
            'grid-template-columns': '1.5rem 1fr',
            gap: '0 0.5rem',
          }}
        >
          <div class="self-center size-4 flex items-center justify-center relative group">
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
            class={cn('flex items-center min-w-0', {
              'opacity-80 font-normal': props.dimWhenRead && !props.unread,
              'font-semibold': props.unread,
            })}
          >
            {props.children}
          </div>
        </div>
      }
    >
      <div
        class={cn(
          'grid w-full text-xs font-medium text-ink-muted py-2 px-2 rounded-sm items-center',
          props.checked ? 'bg-accent/10' : 'bg-ink/5 hover:bg-ink/10'
        )}
        style={{
          'grid-template-columns': '1.5rem 1fr',
          gap: '0 0.5rem',
        }}
      >
        <div class="self-center size-4 flex items-center justify-center relative group">
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
        <div class="flex items-center min-w-0">
          {props.children}
        </div>
      </div>
    </Show>
  );
}

function SharedIndicator(props: { ownerId: string }) {
  return (
    <Tooltip
      tooltip={
        <div class="flex items-center gap-2 max-w-48">
          <UserIcon id={props.ownerId} size="xs" class="shrink-0" />
          <span class="text-xs truncate">
            <DisplayName id={props.ownerId} /> shared this
          </span>
        </div>
      }
    >
      <UsersIcon class="size-3.5 text-ink-muted opacity-70 shrink-0" />
    </Tooltip>
  );
}

const STATUS_TO_TASK_STATUS: Record<string, TaskStatus> = {
  [PROPERTY_OPTION_IDS.STATUS.NOT_STARTED]: 'created',
  [PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS]: 'in-progress',
  [PROPERTY_OPTION_IDS.STATUS.IN_REVIEW]: 'in-review',
  [PROPERTY_OPTION_IDS.STATUS.COMPLETED]: 'done',
  [PROPERTY_OPTION_IDS.STATUS.CANCELED]: 'cancelled',
};

const STATUS_TO_COLOR: Record<string, string> = {
  [PROPERTY_OPTION_IDS.STATUS.NOT_STARTED]: 'text-task',
  [PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS]: 'text-alert-ink',
  [PROPERTY_OPTION_IDS.STATUS.IN_REVIEW]: 'text-note',
  [PROPERTY_OPTION_IDS.STATUS.COMPLETED]: 'text-accent',
  [PROPERTY_OPTION_IDS.STATUS.CANCELED]: 'text-ink-muted',
};

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
      status: STATUS_TO_TASK_STATUS[optionId] ?? 'created',
      color: STATUS_TO_COLOR[optionId] ?? 'text-task',
    };
  });
}

function TaskPropertyGroup(props: {
  entity: EntityWithProperties<EntityData>;
  include: string[];
  condensed?: boolean;
}) {
  const properties = createMemo((): Property[] => {
    const soupProperties = props.entity.properties ?? [];
    return soupProperties
      .map(soupPropertyToProperty)
      .filter((p) => props.include.includes(p.propertyDefinitionId));
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
    <Show when={properties().length > 0}>
      <PropertiesProvider
        entityType={EntityType.TASK}
        canEdit={true}
        properties={properties}
        onRefresh={() => {}}
        onPropertyAdded={() => {}}
        onPropertyDeleted={() => {}}
        saveHandler={saveHandler}
      >
        <div class="flex items-center gap-1 [&_div[role='button']]:!p-0 [&_div[role='button']]:!h-fit">
          <Index each={properties()}>
            {(property) => (
              <PropertyValue
                property={property()}
                condensed={props.condensed ?? true}
              />
            )}
          </Index>
        </div>
        <Suspense>
          <Modals />
        </Suspense>
      </PropertiesProvider>
    </Show>
  );
}

function EmailLayout(props: BaseLayoutProps & { email: EmailEntity }) {
  return (
    <LayoutShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      hasNotifications={props.hasNotifications}
    >
      <div
        class="grid items-center gap-x-2 min-w-0 w-full"
        style={{ 'grid-template-columns': 'auto 12rem minmax(0, 1fr) auto' }}
      >
        <div class="[&_svg]:size-4">
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
              <Entity.Icon
                entity={props.entity}
                streamState={props.streamState}
              />
            </Match>
          </Switch>
        </div>
        <span class="flex items-center gap-1.5 min-w-0">
          <span class="ph-no-capture truncate whitespace-nowrap">
            <Entity.EmailParticipants entity={props.email} />
          </span>
          <Show when={props.isShared}>
            <SharedIndicator ownerId={props.entity.ownerId} />
          </Show>
        </span>
        <span class="flex items-center gap-1.5 min-w-0 mr-8">
          <span class="shrink-0 max-w-[50%] truncate">
            <Entity.Title entity={props.entity} />
          </span>
          <Show when={props.email.snippet}>
            <span class="truncate text-ink/60 font-normal max-w-[50%]">
              {props.email.snippet}
            </span>
          </Show>
        </span>
        <span class="text-xs text-ink-extra-muted font-light text-right whitespace-nowrap shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
    </LayoutShell>
  );
}

function ChannelLayout(props: BaseLayoutProps & { channel: ChannelEntity }) {
  const senderName = props.channel.latestMessage?.senderId
    ? useDisplayNameParts(tryMacroId(props.channel.latestMessage.senderId))
    : undefined;

  return (
    <LayoutShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      hasNotifications={props.hasNotifications}
    >
      <div
        class="grid items-center gap-x-2 min-w-0 w-full"
        style={{ 'grid-template-columns': 'auto 12rem minmax(0, 1fr) auto' }}
      >
        <div class="size-4 shrink-0">
          <Show
            when={
              props.channel.channelType === 'direct_message' &&
              props.channel.participantIds?.[0]
            }
            fallback={
              <div class="[&_svg]:size-4">
                <Entity.Icon
                  entity={props.entity}
                  streamState={props.streamState}
                />
              </div>
            }
          >
            {(participantId) => <UserIcon id={participantId()} size="fill" />}
          </Show>
        </div>
        <span class="flex items-center gap-1.5 min-w-0">
          <span class="ph-no-capture truncate whitespace-nowrap">
            <Entity.Title entity={props.entity} />
          </span>
          <Show when={props.isShared}>
            <SharedIndicator ownerId={props.entity.ownerId} />
          </Show>
        </span>
        <span class="flex items-center gap-1.5 min-w-0 mr-8">
          <Show when={!props.hasNotifications && props.channel.latestMessage}>
            {(msg) => (
              <>
                <Show when={msg().senderId}>
                  {(id) => (
                    <span class="flex items-center gap-1 text-ink-muted shrink-0 max-w-24">
                      <UserIcon id={id()} size="xs" />
                      <Show when={senderName?.firstName()}>
                        {(name) => (
                          <span class="text-xs truncate">{name()}</span>
                        )}
                      </Show>
                    </span>
                  )}
                </Show>
                <span class="truncate min-w-0 text-ink/50 max-w-[50%]">
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
              </>
            )}
          </Show>
        </span>
        <Show
          when={
            !props.hasNotifications &&
            !(isChannelEntity(props.entity) && isSearchEntity(props.entity))
          }
        >
          <span class="text-xs text-ink-extra-muted font-light text-right whitespace-nowrap shrink-0">
            <Entity.Timestamp entity={props.entity} />
          </span>
        </Show>
      </div>
    </LayoutShell>
  );
}

function ChannelMessageLayout(
  props: BaseLayoutProps & { message: ChannelMessageEntity }
) {
  return (
    <LayoutShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      hasNotifications={props.hasNotifications}
    >
      <div class="flex items-center gap-2 min-w-0 w-full">
        <div class="[&_svg]:size-4 shrink-0">
          <Entity.Icon entity={props.entity} streamState={props.streamState} />
        </div>
        <span class="text-ink-muted text-xs shrink-0">
          {props.message.channelName}
        </span>
        <Show when={props.message.senderId}>
          {(id) => (
            <span class="flex items-center gap-1 shrink-0">
              <UserIcon id={id()} size="xs" />
              <span class="ph-no-capture">
                <DisplayName id={id()} format="firstName" />
              </span>
            </span>
          )}
        </Show>
        <span class="text-ink/50 truncate min-w-0">
          {props.message.content}
        </span>
        <span class="ml-auto text-xs text-ink-extra-muted font-light text-right whitespace-nowrap shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
    </LayoutShell>
  );
}

function TaskLayout(props: BaseLayoutProps & { task: TaskEntity }) {
  const taskStatus = useTaskStatus(props.entity as EntityWithProperties<EntityData>);

  return (
    <LayoutShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      hasNotifications={props.hasNotifications}
    >
      <div
        class="grid items-center gap-x-2 min-w-0 w-full"
        style={{ 'grid-template-columns': 'auto 1fr auto 1.25rem auto auto' }}
      >
        <div class="[&_svg]:size-4">
          <Show
            when={taskStatus()}
            fallback={<CircleDashedIcon class="size-4 text-ink-extra-muted" />}
          >
            <TaskPropertyGroup
              entity={props.entity}
              include={[SYSTEM_PROPERTY_IDS.STATUS]}
            />
          </Show>
        </div>
        <span class="flex items-center gap-1.5 min-w-0">
          <span class="ph-no-capture text-sm truncate">
            <Entity.Title entity={props.entity} />
          </span>
          <Show when={props.isShared}>
            <SharedIndicator ownerId={props.entity.ownerId} />
          </Show>
        </span>
        <Show
          when={isProjectContainedEntity(props.entity) && props.entity}
          fallback={<span />}
        >
          {(entity) => (
            <span class="ph-no-capture text-ink-extra-muted text-xs truncate max-w-32">
              <ProjectBreadCrumb
                entity={entity()}
                onClick={props.onProjectClick}
              />
            </span>
          )}
        </Show>
        <div class="flex justify-end">
          <TaskPropertyGroup
            entity={props.entity}
            include={[SYSTEM_PROPERTY_IDS.PRIORITY]}
          />
        </div>
        <div class="flex justify-end">
          <TaskPropertyGroup
            entity={props.entity}
            include={[SYSTEM_PROPERTY_IDS.ASSIGNEES]}
          />
        </div>
        <span class="text-xs text-ink-extra-muted font-light text-right whitespace-nowrap shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
    </LayoutShell>
  );
}

function CallLayout(props: BaseLayoutProps & { call: CallEntity }) {
  const maxParticipants = 4;
  const participants = () =>
    props.call.participantIds?.slice(0, maxParticipants) ?? [];
  const extraCount = () =>
    Math.max(0, (props.call.participantIds?.length ?? 0) - maxParticipants);
  const showMissedIcon = () => !props.call.attended && !props.call.isActive;

  return (
    <LayoutShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      hasNotifications={props.hasNotifications}
    >
      <div class="flex items-center gap-2 min-w-0 w-full">
        <div class="[&_svg]:size-4 shrink-0">
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
        </div>
        <span class="ph-no-capture truncate max-w-[50%]">
          <Entity.Title entity={props.entity} />
        </span>
        <Show
          when={props.call.durationMs}
          fallback={
            props.call.isActive ? (
              <span class="text-accent text-xs flex items-center gap-1 shrink-0">
                <span class="size-1.5 animate-pulse rounded-full bg-accent" />
                Live
              </span>
            ) : null
          }
        >
          {(ms) => (
            <span class="text-ink-extra-muted text-xs shrink-0">
              {formatCallDuration(ms())}
            </span>
          )}
        </Show>
        <Show when={props.call.channelName}>
          <span class="text-ink-muted text-xs shrink-0">
            in {props.call.channelName}
          </span>
        </Show>
        <div class="ml-auto flex items-center gap-2 shrink-0">
          <Show when={participants().length > 0}>
            <div class="flex items-center">
              <For each={participants()}>
                {(id, index) => (
                  <div class={cn('relative', index() > 0 && '-ml-1.5')}>
                    <UserIcon id={id} size="xs" />
                  </div>
                )}
              </For>
              <Show when={extraCount() > 0}>
                <span class="text-xs text-ink-muted ml-1">+{extraCount()}</span>
              </Show>
            </div>
          </Show>
          <span class="text-xs text-ink-extra-muted font-light text-right whitespace-nowrap shrink-0">
            <Entity.Timestamp entity={props.entity} />
          </span>
        </div>
      </div>
    </LayoutShell>
  );
}

function AutomationLayout(
  props: BaseLayoutProps & { automation: AutomationEntity }
) {
  return (
    <LayoutShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      hasNotifications={props.hasNotifications}
    >
      <div class="flex items-center gap-2 min-w-0 w-full">
        <div class="[&_svg]:size-4 shrink-0">
          <Entity.Icon entity={props.entity} streamState={props.streamState} />
        </div>
        <span class="ph-no-capture truncate max-w-[50%]">
          <Entity.Title entity={props.entity} />
        </span>
        <Show when={props.isShared}>
          <SharedIndicator ownerId={props.entity.ownerId} />
        </Show>
        <span class="flex items-center gap-1 shrink-0">
          <UserIcon id={props.entity.ownerId} size="xs" />
          <span class="text-xs text-ink-muted">
            <DisplayName id={props.entity.ownerId} format="firstName" />
          </span>
        </span>
        <span class="ml-auto text-xs shrink-0">
          <Switch>
            <Match when={props.automation.isRunning}>
              <span class="flex items-center gap-1 text-accent">
                <span class="size-1.5 animate-pulse rounded-full bg-accent" />
                Running
              </span>
            </Match>
            <Match
              when={props.automation.enabled && props.automation.nextRunAt}
            >
              {(nextRunAt) => (
                <span class="text-ink-extra-muted">
                  Next run {formatDateAndTime(nextRunAt())}
                </span>
              )}
            </Match>
            <Match when={!props.automation.enabled}>
              <span class="text-ink-extra-muted">Paused</span>
            </Match>
          </Switch>
        </span>
      </div>
    </LayoutShell>
  );
}

function DefaultLayout(props: BaseLayoutProps) {
  return (
    <LayoutShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      hasNotifications={props.hasNotifications}
    >
      <div class="flex items-center gap-2 min-w-0 w-full">
        <div class="[&_svg]:size-4 shrink-0">
          <Entity.Icon entity={props.entity} streamState={props.streamState} />
        </div>
        <span class="ph-no-capture truncate max-w-[50%]">
          <Entity.Title entity={props.entity} />
        </span>
        <Show when={props.isShared}>
          <SharedIndicator ownerId={props.entity.ownerId} />
        </Show>
        <div class="ml-auto flex items-center gap-2 shrink-0">
          <Show when={isProjectContainedEntity(props.entity) && props.entity}>
            {(entity) => (
              <span class="ph-no-capture text-ink-extra-muted text-xs">
                <ProjectBreadCrumb
                  entity={entity()}
                  onClick={props.onProjectClick}
                />
              </span>
            )}
          </Show>
          <span class="text-xs text-ink-extra-muted font-light text-right whitespace-nowrap shrink-0">
            <Entity.Timestamp entity={props.entity} />
          </span>
        </div>
      </div>
    </LayoutShell>
  );
}

function NarrowIconShell(props: {
  checked?: boolean;
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
  unread: boolean;
  dimWhenRead?: boolean;
  icon: JSX.Element;
  children: JSX.Element;
  trailing?: JSX.Element;
  ownerId?: string;
  isShared?: boolean;
}) {
  const mobile = isMobile();

  return (
    <div
      class={cn('grid w-full text-sm py-2 px-2', mobile && 'min-h-[5.25rem]')}
      style={{
        'grid-template-columns': mobile ? '3rem 1fr auto' : '1.5rem 1fr auto',
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
              class={cn(props.checked && 'opacity-0', 'group-hover:opacity-0')}
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
          class="row-span-full flex items-start justify-center"
          style={{ 'grid-column': '1' }}
        >
          <div class="relative flex">
            <Show
              when={props.ownerId}
              fallback={
                <button
                  type="button"
                  class={cn(
                    'size-10 rounded-md grid place-items-center [&_svg]:size-5 [&>*]:size-5 transition-colors',
                    props.checked ? 'bg-accent text-white' : 'bg-ink/5'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onChecked?.(!props.checked, e.shiftKey);
                  }}
                >
                  <Show when={props.checked} fallback={props.icon}>
                    <CheckIcon />
                  </Show>
                </button>
              }
            >
              {(ownerId) => (
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
                        id={ownerId()}
                        size="fill"
                        rounded="md"
                        suppressClick
                      />
                    }
                  >
                    <div class="size-full bg-accent grid place-items-center text-white">
                      <CheckIcon class="size-5" />
                    </div>
                  </Show>
                </button>
              )}
            </Show>
            <Show when={props.isShared}>
              <div class="absolute -bottom-px -right-px rounded-sm bg-surface-0 p-0.5">
                <UsersIcon class="size-3 opacity-70" />
              </div>
            </Show>
          </div>
        </div>
      </Show>
      <div
        class={cn('flex flex-col gap-0.5 min-w-0 pt-1.5', {
          'opacity-80 font-normal': props.dimWhenRead && !props.unread,
          'font-semibold': props.unread,
        })}
        style={{ 'grid-column': '2' }}
      >
        {props.children}
      </div>
      <div
        class="row-span-full flex items-start pt-1.5"
        style={{ 'grid-column': '3' }}
      >
        {props.trailing}
      </div>
    </div>
  );
}

function NarrowEmailLayout(props: BaseLayoutProps & { email: EmailEntity }) {
  const icon = (
    <Switch>
      <Match when={props.email.isDraft}>
        <FileDashedIcon class="text-ink-muted" />
      </Match>
      <Match when={props.email.hasIcsAttachment}>
        <CalendarBlankIcon class="text-ink-muted" />
      </Match>
      <Match when={!props.unread}>
        <EnvelopeOpenIcon class="text-ink-muted" />
      </Match>
      <Match when={true}>
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      </Match>
    </Switch>
  );

  return (
    <NarrowIconShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={icon}
      ownerId={props.entity.ownerId}
      isShared={props.isShared}
      trailing={
        <span class="flex items-center gap-1.5 text-xs text-ink-extra-muted font-light whitespace-nowrap">
          <Show when={props.isShared}>
            <UsersIcon class="size-3.5 shrink-0 opacity-50" />
          </Show>
          <Entity.Timestamp entity={props.entity} />
        </span>
      }
    >
      <span class="flex items-center gap-1.5 min-w-0">
        <span class="shrink-0 [&_svg]:size-4">{icon}</span>
        <span class="ph-no-capture text-sm truncate">
          <Entity.EmailParticipants entity={props.email} />
        </span>
      </span>
      <span class="text-sm text-ink-muted truncate">
        <Entity.Title entity={props.entity} />
      </span>
      <Show when={props.email.snippet}>
        <span class="text-xs text-ink-extra-muted truncate">
          {props.email.snippet}
        </span>
      </Show>
    </NarrowIconShell>
  );
}

function NarrowChannelShell(props: {
  checked?: boolean;
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
  unread: boolean;
  dimWhenRead?: boolean;
  dmParticipantId?: string;
  icon: JSX.Element;
  children: JSX.Element;
  trailing?: JSX.Element;
}) {
  const mobile = isMobile();

  return (
    <div
      class={cn('grid w-full text-sm py-2 px-2', mobile && 'min-h-[5.25rem]')}
      style={{
        'grid-template-columns': mobile ? '3rem 1fr auto' : '1.5rem 1fr auto',
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
              class={cn(props.checked && 'opacity-0', 'group-hover:opacity-0')}
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
          class="row-span-full flex items-start justify-center"
          style={{ 'grid-column': '1' }}
        >
          <button
            type="button"
            class={cn(
              'size-10 rounded-md grid place-items-center transition-colors',
              props.checked
                ? 'bg-accent text-white'
                : props.dmParticipantId
                  ? ''
                  : 'bg-ink/5 [&_svg]:size-6 [&>*]:size-6'
            )}
            onClick={(e) => {
              e.stopPropagation();
              props.onChecked?.(!props.checked, e.shiftKey);
            }}
          >
            <Show
              when={props.checked}
              fallback={
                <Show when={props.dmParticipantId} fallback={props.icon}>
                  {(participantId) => (
                    <UserIcon
                      id={participantId()}
                      size="fill"
                      rounded="md"
                      class="size-10"
                    />
                  )}
                </Show>
              }
            >
              <CheckIcon class="size-5" />
            </Show>
          </button>
        </div>
      </Show>
      <div
        class={cn('flex flex-col gap-0.5 min-w-0 pt-1.5', {
          'opacity-80 font-normal': props.dimWhenRead && !props.unread,
          'font-semibold': props.unread,
        })}
        style={{ 'grid-column': '2' }}
      >
        {props.children}
      </div>
      <div
        class="row-span-full flex items-start pt-1.5"
        style={{ 'grid-column': '3' }}
      >
        {props.trailing}
      </div>
    </div>
  );
}

function NarrowChannelLayout(
  props: BaseLayoutProps & { channel: ChannelEntity }
) {
  const senderName = props.channel.latestMessage?.senderId
    ? useDisplayNameParts(tryMacroId(props.channel.latestMessage.senderId))
    : undefined;

  const dmParticipantId = () =>
    props.channel.channelType === 'direct_message'
      ? props.channel.participantIds?.[0]
      : undefined;

  return (
    <NarrowChannelShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      dmParticipantId={dmParticipantId()}
      icon={
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      }
      trailing={
        <Show
          when={
            !props.hasNotifications &&
            !(isChannelEntity(props.entity) && isSearchEntity(props.entity))
          }
        >
          <span class="flex items-center gap-1.5 text-xs text-ink-extra-muted font-light whitespace-nowrap">
            <Show when={props.isShared}>
              <UsersIcon class="size-3.5 shrink-0 opacity-50" />
            </Show>
            <Entity.Timestamp entity={props.entity} />
          </span>
        </Show>
      }
    >
      <span class="flex items-center gap-1.5 min-w-0">
        <span class="shrink-0 [&_svg]:size-4">
          <Entity.Icon entity={props.entity} streamState={props.streamState} />
        </span>
        <span class="ph-no-capture text-sm truncate">
          <Entity.Title entity={props.entity} />
        </span>
      </span>
      <Show when={!props.hasNotifications}>
        <Show
          when={props.channel.latestMessage}
          fallback={<span class="text-ink-extra-muted text-xs">No messages</span>}
        >
        {(msg) => (
          <span class="flex items-center gap-1.5 min-w-0 text-sm text-ink-muted">
            <Show
              when={
                props.channel.channelType !== 'direct_message' && msg().senderId
              }
            >
              {(id) => (
                <span class="flex items-center gap-1 shrink-0">
                  <UserIcon id={id()} size="xs" />
                  <Show when={senderName?.firstName()}>
                    {(name) => <span class="text-xs">{name()}</span>}
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
          </span>
        )}
        </Show>
      </Show>
    </NarrowChannelShell>
  );
}

function StatusPillContent(props: {
  entity: EntityWithProperties<EntityData>;
}) {
  const statusData = createMemo(() => {
    const soupProperties = props.entity.properties ?? [];
    const prop = soupProperties
      .map(soupPropertyToProperty)
      .find((p) => p.propertyDefinitionId === SYSTEM_PROPERTY_IDS.STATUS);
    if (!prop || prop.valueType !== 'SELECT_STRING') return null;
    const selectedId = prop.value?.[0];
    if (!selectedId) return null;
    const label = formatPropertyValue(prop, selectedId);
    return { id: selectedId, label };
  });

  return (
    <Show
      when={statusData()}
      fallback={
        <>
          <CircleDashedIcon class="size-3 text-ink-extra-muted" />
          <span>No status</span>
        </>
      }
    >
      {(status) => (
        <>
          <PropertyValueIcon optionId={status().id} class="size-3" />
          <span>{status().label}</span>
        </>
      )}
    </Show>
  );
}

function PriorityPillContent(props: {
  entity: EntityWithProperties<EntityData>;
}) {
  const priorityData = createMemo(() => {
    const soupProperties = props.entity.properties ?? [];
    const prop = soupProperties
      .map(soupPropertyToProperty)
      .find((p) => p.propertyDefinitionId === SYSTEM_PROPERTY_IDS.PRIORITY);
    if (!prop || prop.valueType !== 'SELECT_STRING') return null;
    const selectedId = prop.value?.[0];
    if (!selectedId) return null;
    const label = formatPropertyValue(prop, selectedId);
    return { id: selectedId, label };
  });

  return (
    <Show
      when={priorityData()}
      fallback={
        <>
          <CircleDashedIcon class="size-3 text-ink-extra-muted shrink-0" />
          <span>No priority</span>
        </>
      }
    >
      {(priority) => (
        <>
          <PropertyValueIcon optionId={priority().id} class="size-3 shrink-0" />
          <span>{priority().label}</span>
        </>
      )}
    </Show>
  );
}

function AssigneesPillContent(props: {
  entity: EntityWithProperties<EntityData>;
}) {
  const assigneesProperty = createMemo(() => {
    const soupProperties = props.entity.properties ?? [];
    const prop = soupProperties
      .map(soupPropertyToProperty)
      .find((p) => p.propertyDefinitionId === SYSTEM_PROPERTY_IDS.ASSIGNEES);
    if (!prop || prop.valueType !== 'ENTITY') return null;
    return prop.value ?? null;
  });

  const assigneeIds = () => assigneesProperty()?.map((e) => e.entity_id) ?? [];

  return (
    <Show
      when={assigneeIds().length > 0}
      fallback={
        <>
          <CircleDashedIcon class="size-3 text-ink-extra-muted" />
          <span>Unassigned</span>
        </>
      }
    >
      <div class="flex items-center">
        <For each={assigneeIds().slice(0, 3)}>
          {(id, index) => (
            <div class={cn(index() > 0 && '-ml-1')}>
              <UserIcon id={id} size="xs" />
            </div>
          )}
        </For>
      </div>
      <Show
        when={assigneeIds().length === 1}
        fallback={
          <span class="truncate">
            <DisplayName id={assigneeIds()[0]} format="firstName" />
            {assigneeIds().length > 1 && ` +${assigneeIds().length - 1}`}
          </span>
        }
      >
        <span class="truncate">
          <DisplayName id={assigneeIds()[0]} format="firstName" />
        </span>
      </Show>
    </Show>
  );
}

function TaskPropertyPills(props: {
  entity: EntityWithProperties<EntityData>;
  dim?: boolean;
}) {
  return (
    <>
      <span
        class={cn(
          'flex items-center gap-1.5 px-1 py-0.5 rounded-xs border text-xs whitespace-nowrap shrink-0',
          props.dim
            ? 'border-edge-muted/50 text-ink-muted/70'
            : 'border-edge-muted text-ink-muted'
        )}
      >
        <StatusPillContent entity={props.entity} />
      </span>
      <span
        class={cn(
          'flex items-center gap-1.5 px-1 py-0.5 rounded-xs border text-xs whitespace-nowrap shrink-0',
          props.dim
            ? 'border-edge-muted/50 text-ink-muted/70'
            : 'border-edge-muted text-ink-muted'
        )}
      >
        <PriorityPillContent entity={props.entity} />
      </span>
      <span
        class={cn(
          'flex items-center gap-1.5 px-1 py-0.5 rounded-xs border text-xs whitespace-nowrap basis-24 grow max-w-fit overflow-hidden',
          props.dim
            ? 'border-edge-muted/50 text-ink-muted/70'
            : 'border-edge-muted text-ink-muted'
        )}
      >
        <AssigneesPillContent entity={props.entity} />
      </span>
    </>
  );
}

function NarrowTaskLayout(props: BaseLayoutProps & { task: TaskEntity }) {
  const mobile = isMobile();
  const taskStatus = useTaskStatus(props.entity as EntityWithProperties<EntityData>);

  return (
    <div
      class={cn('grid w-full text-sm py-2 px-2', mobile && 'min-h-[5.25rem]')}
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
              class={cn(props.checked && 'opacity-0', 'group-hover:opacity-0')}
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
          class="row-span-full flex items-start justify-center"
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
                    rounded="md"
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
              <div class="absolute -bottom-px -right-px rounded-sm bg-surface-0 p-0.5">
                <UsersIcon class="size-3 opacity-70" />
              </div>
            </Show>
          </div>
        </div>
      </Show>
      <div
        class={cn('flex flex-col gap-0.5 min-w-0 pt-1.5', {
          'opacity-80 font-normal':
            (props.dimWhenRead ?? true) && !props.unread,
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
                    <CircleDashedIcon class="size-4 text-ink-extra-muted" />
                  }
                >
                  <TaskPropertyGroup
                    entity={props.entity}
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
        <div class="flex flex-wrap items-center gap-1 min-w-0">
          {(() => {
            const dim = (props.dimWhenRead ?? true) && !props.unread;
            return (
              <Show
                when={mobile}
                fallback={
                  <>
                    <span
                      class={cn(
                        'flex items-center gap-1.5 px-1 py-0.5 rounded-xs border text-xs whitespace-nowrap shrink-0',
                        dim
                          ? 'border-edge-muted/50 text-ink-muted/70'
                          : 'border-edge-muted text-ink-muted'
                      )}
                    >
                      <PriorityPillContent
                        entity={
                          props.entity as EntityWithProperties<EntityData>
                        }
                      />
                    </span>
                    <span
                      class={cn(
                        'flex items-center gap-1.5 px-1 py-0.5 rounded-xs border text-xs whitespace-nowrap basis-24 grow max-w-fit overflow-hidden',
                        dim
                          ? 'border-edge-muted/50 text-ink-muted/70'
                          : 'border-edge-muted text-ink-muted'
                      )}
                    >
                      <AssigneesPillContent
                        entity={
                          props.entity as EntityWithProperties<EntityData>
                        }
                      />
                    </span>
                  </>
                }
              >
                <TaskPropertyPills
                  entity={props.entity as EntityWithProperties<EntityData>}
                  dim={dim}
                />
              </Show>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function NarrowDocumentLayout(
  props: BaseLayoutProps & { document: DocumentEntity }
) {
  const mobile = isMobile();

  return (
    <NarrowIconShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      }
      ownerId={props.entity.ownerId}
      isShared={props.isShared}
      trailing={
        <span class="text-xs text-ink-extra-muted font-light whitespace-nowrap">
          <Entity.Timestamp entity={props.entity} />
        </span>
      }
    >
      <span class="flex items-center gap-1.5 min-w-0">
        <span class="shrink-0 [&_svg]:size-4">
          <Entity.Icon entity={props.entity} streamState={props.streamState} />
        </span>
        <span class="ph-no-capture text-sm truncate">
          <Entity.Title entity={props.entity} />
        </span>
      </span>
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
    </NarrowIconShell>
  );
}

function NarrowAutomationLayout(
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
    <NarrowIconShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      }
      trailing={
        <span class="flex items-center gap-1.5 text-xs text-ink-extra-muted font-light whitespace-nowrap">
          <Show when={props.isShared}>
            <UsersIcon class="size-3.5 shrink-0 opacity-50" />
          </Show>
          <Entity.Timestamp entity={props.entity} />
        </span>
      }
    >
      <span class="ph-no-capture text-sm truncate">
        <Entity.Title entity={props.entity} />
      </span>
      <div class="flex flex-wrap items-center gap-2 min-w-0 mt-1">
        <span
          class={cn(
            'flex items-center gap-1.5 px-1 py-0.5 rounded-xs border text-xs whitespace-nowrap',
            isRunning()
              ? 'border-accent/30 text-accent'
              : 'border-edge-muted text-ink-muted'
          )}
        >
          <Show when={isRunning()}>
            <span class="size-1.5 animate-pulse rounded-full bg-accent" />
          </Show>
          {statusText()}
        </span>
        <span class="flex items-center gap-1.5 px-1 py-0.5 rounded-xs border border-edge-muted text-xs text-ink-muted whitespace-nowrap">
          <UserIcon id={props.entity.ownerId} size="xs" />
          <DisplayName id={props.entity.ownerId} format="firstName" />
        </span>
      </div>
    </NarrowIconShell>
  );
}

function NarrowChatLayout(props: BaseLayoutProps & { chat: ChatEntity }) {
  return (
    <NarrowIconShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      }
      ownerId={props.entity.ownerId}
      isShared={props.isShared}
      trailing={
        <span class="text-xs text-ink-extra-muted font-light whitespace-nowrap">
          <Entity.Timestamp entity={props.entity} />
        </span>
      }
    >
      <span class="flex items-center gap-1.5 min-w-0">
        <span class="shrink-0 [&_svg]:size-4">
          <Entity.Icon entity={props.entity} streamState={props.streamState} />
        </span>
        <span class="ph-no-capture text-sm truncate">
          <Entity.Title entity={props.entity} />
        </span>
      </span>
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
    </NarrowIconShell>
  );
}

function NarrowCallLayout(props: BaseLayoutProps & { call: CallEntity }) {
  const maxParticipants = 3;
  const participants = () =>
    props.call.participantIds?.slice(0, maxParticipants) ?? [];
  const extraCount = () =>
    Math.max(0, (props.call.participantIds?.length ?? 0) - maxParticipants);
  const showMissedIcon = () => !props.call.attended && !props.call.isActive;

  return (
    <NarrowIconShell
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
      trailing={
        <span class="text-xs text-ink-extra-muted font-light whitespace-nowrap">
          <Entity.Timestamp entity={props.entity} />
        </span>
      }
    >
      <span class="flex items-center gap-1.5 min-w-0">
        <span class="shrink-0 [&_svg]:size-4">
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
        <span class="ph-no-capture text-sm truncate">
          <Entity.Title entity={props.entity} />
        </span>
        <Show
          when={props.call.durationMs}
          fallback={
            props.call.isActive ? (
              <span class="text-accent text-xs flex items-center gap-1 shrink-0">
                <span class="size-1.5 animate-pulse rounded-full bg-accent" />
                Live
              </span>
            ) : null
          }
        >
          {(ms) => (
            <span class="text-ink-extra-muted text-xs shrink-0">
              {formatCallDuration(ms())}
            </span>
          )}
        </Show>
      </span>
      <div class="flex items-center gap-1.5 text-xs text-ink-muted">
        <Show when={props.call.channelName}>
          <span class="truncate">in {props.call.channelName}</span>
        </Show>
        <Show when={participants().length > 0}>
          <div class="flex items-center ml-auto">
            <For each={participants()}>
              {(id, index) => (
                <div class={cn('relative', index() > 0 && '-ml-1.5')}>
                  <UserIcon id={id} size="xs" />
                </div>
              )}
            </For>
            <Show when={extraCount() > 0}>
              <span class="text-xs text-ink-muted ml-1">+{extraCount()}</span>
            </Show>
          </div>
        </Show>
      </div>
    </NarrowIconShell>
  );
}

function NarrowDefaultLayout(props: BaseLayoutProps) {
  return (
    <NarrowIconShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
      dimWhenRead={props.dimWhenRead ?? true}
      icon={
        <Entity.Icon entity={props.entity} streamState={props.streamState} />
      }
      trailing={
        <span class="flex items-center gap-1.5 text-xs text-ink-extra-muted font-light whitespace-nowrap">
          <Show when={props.isShared}>
            <UsersIcon class="size-3.5 shrink-0 opacity-50" />
          </Show>
          <Entity.Timestamp entity={props.entity} />
        </span>
      }
    >
      <span class="ph-no-capture text-sm truncate">
        <Entity.Title entity={props.entity} />
      </span>
      <Show when={isProjectContainedEntity(props.entity)}>
        <div class="flex flex-wrap items-center gap-2 min-w-0 mt-1">
          <Show when={isProjectContainedEntity(props.entity) && props.entity}>
            {(entity) => (
              <span class="ph-no-capture text-ink-extra-muted text-xs truncate">
                <ProjectBreadCrumb
                  entity={entity()}
                  onClick={props.onProjectClick}
                />
              </span>
            )}
          </Show>
        </div>
      </Show>
    </NarrowIconShell>
  );
}

export function StackedListEntity(props: StackedListEntityProps) {
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

  const isWide = useListLayout()?.isWide ?? (() => true);

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
        'soup-stacked-entity w-full relative group/stacked rounded-sm',
        hasNotifications()
          ? 'pt-2'
          : {
              'border-b border-edge-muted': !isWide() && isMobile(),
              'bg-accent/10': props.checked || (props.highlighted && !isMobile()),
              'hover:bg-ink/5':
                !props.checked && !props.highlighted && !props.hovered,
              'bg-ink/5': props.hovered && !props.highlighted && !props.checked,
            }
      )}
      onMouseMove={props.onMouseMove}
    >
      <div
        class={cn(
          'absolute h-full w-[2px] left-0 top-0 bg-accent rounded-r-full opacity-0',
          {
            'opacity-100': props.highlighted && !isMobile(),
          }
        )}
      />

      <Show
        when={isWide()}
        fallback={
          <Switch fallback={<NarrowDefaultLayout {...baseProps()} />}>
            <Match when={isEmailEntity(props.entity) && props.entity}>
              {(email) => (
                <NarrowEmailLayout {...baseProps()} email={email()} />
              )}
            </Match>
            <Match when={isChannelEntity(props.entity) && props.entity}>
              {(channel) => (
                <NarrowChannelLayout {...baseProps()} channel={channel()} />
              )}
            </Match>
            <Match when={isTaskEntity(props.entity) && props.entity}>
              {(task) => <NarrowTaskLayout {...baseProps()} task={task()} />}
            </Match>
            <Match when={isDocumentEntity(props.entity) && props.entity}>
              {(document) => (
                <NarrowDocumentLayout {...baseProps()} document={document()} />
              )}
            </Match>
            <Match when={isAutomationEntity(props.entity) && props.entity}>
              {(automation) => (
                <NarrowAutomationLayout
                  {...baseProps()}
                  automation={automation()}
                />
              )}
            </Match>
            <Match when={isChatEntity(props.entity) && props.entity}>
              {(chat) => <NarrowChatLayout {...baseProps()} chat={chat()} />}
            </Match>
            <Match when={isCallEntity(props.entity) && props.entity}>
              {(call) => <NarrowCallLayout {...baseProps()} call={call()} />}
            </Match>
          </Switch>
        }
      >
        <Switch fallback={<DefaultLayout {...baseProps()} />}>
          <Match when={isEmailEntity(props.entity) && props.entity}>
            {(email) => <EmailLayout {...baseProps()} email={email()} />}
          </Match>
          <Match when={isChannelMessageEntity(props.entity) && props.entity}>
            {(message) => (
              <ChannelMessageLayout {...baseProps()} message={message()} />
            )}
          </Match>
          <Match when={isChannelEntity(props.entity) && props.entity}>
            {(channel) => (
              <ChannelLayout {...baseProps()} channel={channel()} />
            )}
          </Match>
          <Match when={isTaskEntity(props.entity) && props.entity}>
            {(task) => <TaskLayout {...baseProps()} task={task()} />}
          </Match>
          <Match when={isCallEntity(props.entity) && props.entity}>
            {(call) => <CallLayout {...baseProps()} call={call()} />}
          </Match>
          <Match when={isAutomationEntity(props.entity) && props.entity}>
            {(automation) => (
              <AutomationLayout {...baseProps()} automation={automation()} />
            )}
          </Match>
        </Switch>
      </Show>

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
