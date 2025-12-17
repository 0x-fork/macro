import { useGlobalNotificationSource } from '@app/component/GlobalAppState';
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
  SplitPermissionsBadge,
  StaticSplitLabel,
} from '@app/component/split-layout/components/SplitLabel';
import {
  SplitToolbarLeft,
  SplitToolbarRight,
} from '@app/component/split-layout/components/SplitToolbar';
import { SplitPanelContext } from '@app/component/split-layout/context';
import {
  setShowCommentsPreference,
  showCommentsPreference,
} from '@block-md/comments/commentStore';
import { useDownloadDocumentAsMarkdownText } from '@block-md/signal/save';
import { useBlockId, useBlockName, useBlockAliasedName } from '@core/block';
import { IconButton } from '@core/component/IconButton';
import { BlockLiveIndicators } from '@core/component/LiveIndicators';
import { NotificationsModal } from '@core/component/NotificationsModal';
import { ReferencesModal } from '@core/component/ReferencesModal';
import { ShareButton } from '@core/component/TopBar/ShareButton';
import {
  ENABLE_HISTORY_COMPONENT,
  ENABLE_MARKDOWN_LIVE_COLLABORATION,
  ENABLE_PROPERTIES_METADATA,
} from '@core/constant/featureFlags';
import { useCanEdit, useGetPermissions } from '@core/signal/permissions';
import type { EntityType } from '@core/types';
import { useBlockDocumentName } from '@core/util/currentBlockDocumentName';
import ShowComments from '@icon/regular/chat-circle-dots.svg';
import HideComments from '@icon/regular/chat-circle-slash.svg';
import Download from '@icon/regular/download.svg';
import TaskCreated from '@macro-icons/square/task-created.svg';
import TaskInProgress from '@macro-icons/square/task-in-progress.svg';
import TaskInReview from '@macro-icons/square/task-in-review.svg';
import TaskDone from '@macro-icons/square/task-done.svg';
import TaskCancelled from '@macro-icons/square/task-cancelled.svg';
import User from '@macro-icons/square/user.svg';
import PriorityLow from '@macro-icons/wide/priority-low.svg';
import PriorityMedium from '@macro-icons/wide/priority-medium.svg';
import PriorityHigh from '@macro-icons/wide/priority-high.svg';
import PriorityUrgent from '@macro-icons/wide/priority-urgent.svg';
import { blockNameToItemType } from '@service-storage/client';
import { type Component, Show, createSignal, useContext } from 'solid-js';
import { HistoryModal } from './History';
import { MarkdownPropertiesModal } from './MarkdownPropertiesModal';
import { Select } from "@kobalte/core/select";

export function MockupSelect(props: {items: Array<string>, defaultVal: string, iconMap: Map<string, Component>}) {
  const [value, setValue] = createSignal(props.defaultVal);
  const ctx = useContext(SplitPanelContext)
  const iconMap = props.iconMap;
  if (!ctx)
    throw new Error('<MockupDropdown> must be used in <SplitPanelContext>');

  return (
    <Select
      defaultValue={props.defaultVal}
      value={value()}
      onChange={setValue}
      options={props.items}
      placeholder="Set value..."
      placement='bottom-start'
      
      itemComponent={props => (
        <Select.Item item={props.item} class="select__item">
          <Select.ItemLabel>
            <div class="flex items-center px-2.5 py-1 gap-2 hover:bg-panel text-ink-extra-muted hover:text-ink text-sm truncate text-ellipsis">
              {iconMap.get(props.item.rawValue)}
              {props.item.rawValue}
            </div>
          </Select.ItemLabel>
          <Select.ItemIndicator class="select__item-indicator">
          </Select.ItemIndicator>
        </Select.Item>
      )}
    >
      <Select.Trigger class="select__trigger" aria-label="Fruit">
        <Select.Value class="select__value">
          {state => <div class="flex items-center px-2 py-1 gap-2 bg-page rounded-xs border-1 border-edge-muted/50 text-ink-extra-muted text-sm truncate text-ellipsis">
            <div>{iconMap.get(state.selectedOption())}</div>
            {state.selectedOption()}
          </div>}
        </Select.Value>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content class="origin-(--kb-select-content-transform-origin)">
          <Select.Listbox class="py-2 bg-page" />
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}

const TaskCreatedIcon = () => <TaskCreated class="h-3 fill-ink-extra-muted"/>
const TaskInProgressIcon = () => <TaskInProgress class="h-3 fill-accent-3"/>
const TaskInReviewIcon = () => <TaskInReview class="h-3 fill-accent"/>
const TaskDoneIcon = () => <TaskDone class="h-3 fill-accent"/>
const TaskCancelledIcon = () => <TaskCancelled class="h-3 fill-ink-extra-muted"/>

const PriorityLowIcon = () => <PriorityLow class="h-3 fill-ink-extra-muted"/>
const PriorityMediumIcon = () => <PriorityMedium class="h-3 fill-ink-extra-muted"/>
const PriorityHighIcon = () => <PriorityHigh class="h-3 fill-ink-extra-muted"/>
const PriorityUrgentIcon = () => <PriorityUrgent class="h-3 fill-accent"/>

const UserIcon = () => <User class="h-3 fill-ink-extra-muted"/>

export function TopBar() {
  const canEdit = useCanEdit();
  const blockName = useBlockName();
  const blockId = useBlockId();
  const permissions = useGetPermissions();
  const name = useBlockDocumentName();
  const notificationSource = useGlobalNotificationSource();
  const itemType = blockNameToItemType(blockName);
  if (!itemType)
    throw new Error('Using functionality in an unknown item type.');

  const downloadAsMarkdownText = useDownloadDocumentAsMarkdownText();

  const ops: FileOperation[] = [
    { op: 'pin' },
    { op: 'copy' },
    { op: 'rename' },
    { op: 'moveToProject' },
    {
      label: 'Download',
      icon: Download,
      action: downloadAsMarkdownText,
      divideAbove: true,
    },
    { op: 'delete', divideAbove: true },
  ];

  return (
    <>
      <SplitHeaderLeft>
        <BlockItemSplitLabel />
      </SplitHeaderLeft>
      <SplitHeaderRight>
        <BlockLiveIndicators />
      </SplitHeaderRight>
      <SplitToolbarLeft>
        <div class="flex items-center p-1 gap-2">
          <SplitFileMenu
            id={blockId}
            itemType={itemType}
            name={name()}
            ops={ops}
          />
          <Show when={useBlockAliasedName() === 'task'}>
            <MockupSelect
              items={["Created", "In Progress", "In Review", "Done", "Cancelled"]}
              defaultVal={"Created"}
              iconMap={new Map<string, Component>([
                ['Created', TaskCreatedIcon],
                ['In Progress', TaskInProgressIcon],
                ['In Review', TaskInReviewIcon],
                ['Done', TaskDoneIcon],
                ['Cancelled', TaskCancelledIcon]
              ])}
            />
            <MockupSelect
              items={["Low", "Medium", "High", "Urgent"]}
              defaultVal={"Low"}
              iconMap={new Map<string, Component>([
                ['Low', PriorityLowIcon],
                ['Medium', PriorityMediumIcon],
                ['High', PriorityHighIcon],
                ['Urgent', PriorityUrgentIcon]
              ])}
            />
            <MockupSelect
              items={["No Assignee"]}
              defaultVal={"No Assignee"}
              iconMap={new Map<string, Component>([
                ['No Assignee', UserIcon]
              ])}
            />
          </Show>
        </div>
      </SplitToolbarLeft>
      <SplitToolbarRight>
        <div class="flex items-center p-1">
          <Show
            when={
              ENABLE_MARKDOWN_LIVE_COLLABORATION &&
              ENABLE_HISTORY_COMPONENT &&
              canEdit()
            }
          >
            <HistoryModal documentId={blockId} />
          </Show>
          <NotificationsModal
            entity={{ id: blockId, type: itemType as EntityType }}
            notificationSource={notificationSource}
            buttonSize="sm"
          />
          <ReferencesModal
            documentId={blockId}
            documentName={name()}
            buttonSize="sm"
          />
          <IconButton
            size="sm"
            icon={showCommentsPreference() ? HideComments : ShowComments}
            theme="clear"
            onClick={() => setShowCommentsPreference(!showCommentsPreference())}
            tooltip={{
              label: `${showCommentsPreference() ? 'Hide' : 'Show'} Comments`,
            }}
          />
          <Show when={ENABLE_PROPERTIES_METADATA}>
            <MarkdownPropertiesModal documentId={blockId} buttonSize="sm" />
          </Show>
          <div class="flex items-center">
            <SplitPermissionsBadge />
            <ShareButton
              id={blockId}
              name={name()}
              userPermissions={permissions()}
              itemType={itemType}
            />
          </div>
        </div>
      </SplitToolbarRight>
    </>
  );
}

export function InstructionsTopBar() {
  const canEdit = useCanEdit();
  const blockId = useBlockId();
  return (
    <>
      <SplitHeaderLeft>
        <StaticSplitLabel label="AI Instructions" iconType="md" />
      </SplitHeaderLeft>
      <SplitToolbarRight>
        <div class="flex items-center p-1">
          <Show
            when={
              ENABLE_MARKDOWN_LIVE_COLLABORATION &&
              ENABLE_HISTORY_COMPONENT &&
              canEdit()
            }
          >
            <HistoryModal documentId={blockId} />
          </Show>
        </div>
      </SplitToolbarRight>
    </>
  );
}
