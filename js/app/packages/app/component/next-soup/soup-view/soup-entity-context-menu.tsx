import { EntityActionsMenuItems } from '@app/component/EntityActionsMenuItems';
import { ContextMenuContent, MenuSeparator } from '@core/component/Menu';
import { isMobile } from '@core/mobile/isMobile';
import { ContextMenu } from '@kobalte/core/context-menu';
import { Entity, type EntityData } from '@macro-entity';
import { type FlowComponent, Show } from 'solid-js';

interface SoupEntityContextMenuProps {
  entity: EntityData;
  entityTimestamp?: number;
}

export const SoupEntityContextMenu: FlowComponent<
  SoupEntityContextMenuProps
> = (props) => {
  return (
    <ContextMenu>
      <ContextMenu.Trigger class="@container/uList size-full unified-list-root">
        {props.children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <Show when={props.entity}>
          {(selectedEntity) => (
            <ContextMenuContent mobileFullScreen>
              <Show when={isMobile()}>
                <Entity
                  entity={selectedEntity()}
                  timestamp={props.entityTimestamp}
                />
                <MenuSeparator />
              </Show>
              <EntityActionsMenuItems
                entity={selectedEntity()}
                onSelectAction={() => {}}
              />
            </ContextMenuContent>
          )}
        </Show>
      </ContextMenu.Portal>{' '}
    </ContextMenu>
  );
};
