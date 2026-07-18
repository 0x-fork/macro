import { ContextMenuContent, MenuItem } from '@core/component/ContextMenu';
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
import { actionTargets } from '../actions/soup-entity-action-model';
import { useSoupEntityActions } from '../actions/use-soup-entity-actions';

const tagEntityType = (entity: EntityData): EntityType | undefined => {
  if (entity.type === 'document') {
    return entity.subType?.type === 'task'
      ? EntityType.TASK
      : EntityType.DOCUMENT;
  }
  if (entity.type === 'email') return EntityType.THREAD;
  if (entity.type === 'project') return EntityType.PROJECT;
  if (entity.type === 'chat') return EntityType.CHAT;
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
  const entityActions = useSoupEntityActions();
  const [tagPickerOpen, setTagPickerOpen] = createSignal(false);
  const [menuPosition, setMenuPosition] = createSignal<{
    x: number;
    y: number;
  }>();
  const targets = () =>
    actionTargets({
      entity: props.entity,
      selected: props.selectedEntities(),
      entityIsSelected: props.isSelected(),
    });
  const actions = () =>
    entityActions.build(targets(), {
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
            <For each={actions()}>
              {(action) => (
                <MenuItem
                  text={action.label}
                  icon={action.icon}
                  onClick={() => void action.run()}
                  class={action.destructive ? 'text-failure-ink' : undefined}
                />
              )}
            </For>
            <Show when={actions().length === 0}>
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
