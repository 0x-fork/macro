import {
  ContextMenuContent,
  MenuItem,
  MenuSeparator,
} from '@core/component/ContextMenu';
import { isMobile } from '@core/mobile/isMobile';
import type { EntityData } from '@entity';
import { ContextMenu } from '@kobalte/core/context-menu';
import { TagPickerPopover, useSoupDocTags } from '@property/tags';
import { EntityType } from '@service-properties/generated/schemas/entityType';
import type { SoupProperty } from '@service-storage/generated/schemas/soupProperty';
import {
  type Accessor,
  createSignal,
  type FlowComponent,
  For,
  Show,
} from 'solid-js';
import { createSoupEntityActions } from '../../../actions/create-soup-entity-actions';

const tagEntityType = (entity: EntityData): EntityType | undefined => {
  if (entity.type === 'document') {
    return entity.subType?.type === 'task'
      ? EntityType.TASK
      : EntityType.DOCUMENT;
  }
  if (entity.type === 'email') return EntityType.THREAD;
  if (entity.type === 'project') return EntityType.PROJECT;
  if (entity.type === 'chat') return EntityType.CHAT;
  if (entity.type === 'call') return EntityType.CALL_RECORD;
};

function RowTagPicker(props: {
  entityId: string;
  entityType: EntityType;
  properties: Accessor<SoupProperty[] | undefined>;
  position: { x: number; y: number } | undefined;
  onClose: () => void;
}) {
  const tags = useSoupDocTags(
    props.entityId,
    props.entityType,
    props.properties
  );
  return (
    <TagPickerPopover
      docTags={tags}
      open
      onOpenChange={(open) => !open && props.onClose()}
      getAnchorRect={() => props.position}
    />
  );
}

export const SoupEntityContextMenu: FlowComponent<{
  entity: EntityData;
  selectedEntities: Accessor<readonly EntityData[]>;
  isSelected: Accessor<boolean>;
  onOpen: () => void;
}> = (props) => {
  const entityActions = createSoupEntityActions();
  const [tagPickerOpen, setTagPickerOpen] = createSignal(false);
  const [menuPosition, setMenuPosition] = createSignal<{
    x: number;
    y: number;
  }>();
  const targets = () => {
    const selected = props.selectedEntities();
    return props.isSelected() && selected.length > 1
      ? selected
      : [props.entity];
  };
  const actionGroups = () =>
    entityActions.buildActionGroups(targets(), {
      editTags: tagEntityType(props.entity)
        ? () => setTimeout(() => setTagPickerOpen(true), 0)
        : undefined,
    });
  if (isMobile()) return <div class="size-full">{props.children}</div>;
  return (
    <>
      <ContextMenu onOpenChange={(open) => open && props.onOpen()}>
        <ContextMenu.Trigger
          class="group/cm-trigger size-full"
          on:contextmenu={(event: MouseEvent) =>
            setMenuPosition({ x: event.clientX, y: event.clientY })
          }
        >
          {props.children}
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenuContent class="text-xs text-ink-muted">
            <For each={actionGroups()}>
              {(group, groupIndex) => (
                <>
                  <Show when={groupIndex() > 0}>
                    <MenuSeparator />
                  </Show>
                  <For each={group.items}>
                    {(action) => (
                      <MenuItem
                        text={action.label}
                        icon={action.icon}
                        hotkeyToken={action.hotkeyToken}
                        shortcut={action.shortcut}
                        disabled={action.disabled}
                        onClick={() => void action.onClick()}
                        class={
                          action.destructive ? 'text-failure-ink' : undefined
                        }
                      />
                    )}
                  </For>
                </>
              )}
            </For>
            <Show when={actionGroups().length === 0}>
              <div class="px-2 py-1.5 text-ink-extra-muted">
                No actions available
              </div>
            </Show>
          </ContextMenuContent>
        </ContextMenu.Portal>
      </ContextMenu>
      <Show when={tagPickerOpen() && tagEntityType(props.entity)}>
        {(entityType) => (
          <RowTagPicker
            entityId={props.entity.id}
            entityType={entityType()}
            properties={() =>
              'properties' in props.entity ? props.entity.properties : undefined
            }
            position={menuPosition()}
            onClose={() => setTagPickerOpen(false)}
          />
        )}
      </Show>
    </>
  );
};
