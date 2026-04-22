import './ListEntity.css';
import { useSplitPanel } from '@app/component/split-layout/layoutUtils';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { twoLineClampMarkdownTheme } from '@core/component/LexicalMarkdown/theme';
import { Tooltip } from '@core/component/Tooltip';
import { UserIcon } from '@core/component/UserIcon';
import { isMobile } from '@core/mobile/isMobile';
import type { NotificationType } from '@core/types';
import { tryMacroId, useDisplayNameParts } from '@core/user';
import type { DateValue } from '@core/util/date';
import { DisplayName } from '@entity/components/DisplayName';
import ArrowDownLeftIcon from '@icon/regular/arrow-down-left.svg';
import CalendarBlankIcon from '@phosphor-icons/core/bold/calendar-blank-bold.svg';
import EnvelopeOpenIcon from '@icon/regular/envelope-open.svg';
import FileDashedIcon from '@icon/regular/file-dashed.svg';
import PhoneXIcon from '@phosphor-icons/core/bold/phone-x-bold.svg';
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
import { getActionVerb } from '../extractors-notification/notification-description-helpers';
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
import { SYSTEM_PROPERTY_IDS } from '@core/component/Properties/constants';
import { EntityType } from '@service-properties/generated/schemas/entityType';
import { useBulkSaveEntityPropertiesMutation } from '@queries/properties/entity';
import { soupPropertyToProperty } from '../extractors-property/property-helpers';
import type { EntityWithProperties } from '../types/entity';
import {
  type AutomationEntity,
  type CallEntity,
  type ChannelEntity,
  type ChannelMessageEntity,
  type EmailEntity,
  type EntityData,
  type TaskEntity,
  isCallEntity,
  isChannelEntity,
  isChannelMessageEntity,
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
  children: JSX.Element;
}) {
  return (
    <div
      class="grid w-full text-sm py-2.5 px-2"
      style={{
        'grid-template-columns': '1.5rem 1fr',
        gap: '0 0.5rem',
      }}
    >
      <div class="row-span-full flex items-center justify-center relative group">
        <UnreadIndicator
          active={props.unread}
          class={cn(props.checked && 'opacity-0', 'group-hover:opacity-0')}
        />
        <div
          class={cn(
            'absolute inset-0 grid place-items-center',
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
          'opacity-60': props.dimWhenRead && !props.unread,
        })}
      >
        {props.children}
      </div>
    </div>
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
      <ArrowDownLeftIcon class="size-3.5 text-ink-muted shrink-0" />
    </Tooltip>
  );
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
          <For each={properties()}>
            {(property) => (
              <PropertyValue
                property={property}
                condensed={props.condensed ?? true}
              />
            )}
          </For>
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
    >
      <div
        class="grid items-center gap-x-2 min-w-0 w-full"
        style={{ 'grid-template-columns': 'auto 12rem 1fr auto' }}
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
          <span class="ph-no-capture font-medium truncate whitespace-nowrap">
            <Entity.EmailParticipants entity={props.email} />
          </span>
          <Show when={props.isShared}>
            <SharedIndicator ownerId={props.entity.ownerId} />
          </Show>
        </span>
        <span class="flex items-center gap-1.5 min-w-0">
          <span class="shrink-0 font-medium">
            <Entity.Title entity={props.entity} />
          </span>
          <Show when={props.email.snippet}>
            <span class="truncate text-ink/60 font-normal">
              {props.email.snippet}
            </span>
          </Show>
        </span>
        <span class="text-xs text-ink-extra-muted font-light">
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
    >
      <div class="flex items-center gap-2 min-w-0 w-full">
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
        <span class="flex items-center gap-1.5 shrink-0 max-w-[25%]">
          <span class="ph-no-capture font-medium truncate">
            <Entity.Title entity={props.entity} />
          </span>
          <Show when={props.isShared}>
            <SharedIndicator ownerId={props.entity.ownerId} />
          </Show>
        </span>
        <Show when={props.channel.latestMessage}>
          {(msg) => (
            <>
              <Show when={msg().senderId}>
                {(id) => (
                  <span class="flex items-center gap-1 text-ink-muted shrink-0">
                    <UserIcon id={id()} size="xs" />
                    <Show when={senderName?.firstName()}>
                      {(name) => <span class="text-xs">{name()}</span>}
                    </Show>
                  </span>
                )}
              </Show>
              <span class="truncate min-w-0 text-ink/50">
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
        <Show
          when={
            !props.hasNotifications &&
            !(isChannelEntity(props.entity) && isSearchEntity(props.entity))
          }
        >
          <span class="ml-auto text-xs text-ink-extra-muted font-light shrink-0">
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
    >
      <div class="flex items-center gap-2 min-w-0 w-full">
        <div class="[&_svg]:size-4 shrink-0">
          <Entity.Icon
            entity={props.entity}
            streamState={props.streamState}
          />
        </div>
        <span class="text-ink-muted text-xs shrink-0">
          {props.message.channelName}
        </span>
        <Show when={props.message.senderId}>
          {(id) => (
            <span class="flex items-center gap-1 shrink-0">
              <UserIcon id={id()} size="xs" />
              <span class="ph-no-capture font-medium">
                <DisplayName id={id()} format="firstName" />
              </span>
            </span>
          )}
        </Show>
        <span class="text-ink/50 truncate min-w-0">
          {props.message.content}
        </span>
        <span class="ml-auto text-xs text-ink-extra-muted font-light shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
    </LayoutShell>
  );
}

function TaskLayout(props: BaseLayoutProps & { task: TaskEntity }) {
  return (
    <LayoutShell
      checked={props.checked}
      onChecked={props.onChecked}
      unread={props.unread}
    >
      <div class="flex items-center gap-2 min-w-0 w-full">
        <div class="[&_svg]:size-4 shrink-0">
          <TaskPropertyGroup
            entity={props.entity}
            include={[SYSTEM_PROPERTY_IDS.STATUS]}
          />
        </div>
        <span class="flex items-center gap-1.5 min-w-0 flex-1">
          <span class="ph-no-capture font-medium truncate">
            <Entity.Title entity={props.entity} />
          </span>
          <Show when={props.isShared}>
            <SharedIndicator ownerId={props.entity.ownerId} />
          </Show>
        </span>
        <Show when={isProjectContainedEntity(props.entity) && props.entity}>
          {(entity) => (
            <span class="ph-no-capture text-ink-extra-muted text-xs shrink-0">
              <ProjectBreadCrumb
                entity={entity()}
                onClick={props.onProjectClick}
              />
            </span>
          )}
        </Show>
        <div class="shrink-0 flex items-center gap-3 ml-auto">
          <TaskPropertyGroup
            entity={props.entity}
            include={[SYSTEM_PROPERTY_IDS.PRIORITY]}
          />
          <TaskPropertyGroup
            entity={props.entity}
            include={[SYSTEM_PROPERTY_IDS.ASSIGNEES]}
          />
          <span class="text-xs text-ink-extra-muted font-light">
            <Entity.Timestamp entity={props.entity} />
          </span>
        </div>
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
        <span class="ph-no-capture font-medium truncate min-w-0">
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
          <span class="text-xs text-ink-extra-muted font-light">
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
    >
      <div class="flex items-center gap-2 min-w-0 w-full">
        <div class="[&_svg]:size-4 shrink-0">
          <Entity.Icon
            entity={props.entity}
            streamState={props.streamState}
          />
        </div>
        <span class="ph-no-capture font-medium truncate">
          <Entity.Title entity={props.entity} />
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
    >
      <div class="flex items-center gap-2 min-w-0 w-full">
        <div class="[&_svg]:size-4 shrink-0">
          <Entity.Icon
            entity={props.entity}
            streamState={props.streamState}
          />
        </div>
        <span class="flex items-center gap-1.5 min-w-0">
          <span class="ph-no-capture font-medium truncate">
            <Entity.Title entity={props.entity} />
          </span>
          <Show when={props.isShared}>
            <SharedIndicator ownerId={props.entity.ownerId} />
          </Show>
        </span>
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
        <span class="ml-auto text-xs text-ink-extra-muted font-light shrink-0">
          <Entity.Timestamp entity={props.entity} />
        </span>
      </div>
    </LayoutShell>
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
        'soup-stacked-entity w-full relative group/stacked rounded-xs',
        {
          'bg-accent/5': props.checked,
          'hover:bg-hover/10':
            !props.checked && !props.highlighted && !props.hovered,
          'bg-hover/10': props.hovered && !props.highlighted && !props.checked,
          'bg-accent/5': props.highlighted && !isMobile(),
        }
      )}
      onMouseMove={props.onMouseMove}
    >
      <div
        class={cn(
          'absolute h-full w-[3px] left-0 top-0 bg-accent rounded-r-full opacity-0',
          {
            'opacity-100': props.highlighted && !isMobile(),
          }
        )}
      />

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
          {(channel) => <ChannelLayout {...baseProps()} channel={channel()} />}
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

      <Show when={hasNotifications() && !isMobile()}>
        <div class="pl-[1.875rem] pr-2 pb-1.5">
          <Show when={isWithNotification(props.entity) && !showContentHits()}>
            <Entity.Notification.Stacks
              entity={props.entity}
              visibleCount={3}
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
