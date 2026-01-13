import { useSplitLayout } from '@app/component/split-layout/layout';
import {
  SYSTEM_PROPERTY_IDS,
} from '@core/component/Properties/constants';
import { EntityType } from '@service-storage/generated/schemas/entityType';
import { toast } from '@core/component/Toast/Toast';
import { isOk } from '@core/util/maybeResult';
import IconCheck from '@icon/regular/check.svg';
import WideCopy from '@macro-icons/wide/copy.svg';
import WideChat from '@macro-icons/wide/chat.svg'
import WideTask from '@macro-icons/wide/task.svg'
import RightTriangle from '@macro-icons/shape/right-triangle.svg';
import Square from '@macro-icons/shape/square.svg';
import Trash from '@phosphor-icons/core/regular/trash.svg?component-solid';
import { commsServiceClient } from '@service-comms/client';
import { createTask } from '@core/util/create';
import { useUserId } from '@service-gql/client';
import { Button } from '@ui/components/Button';
import { Match, Show, Switch } from 'solid-js';
import { ProfilePicture } from './ProfilePicture';

export type UserTooltipProps = {
  displayName: string;
  email?: string;
  id?: string;
  isDeleted?: boolean;
  copied: boolean;
  onCopyEmail: (e: MouseEvent) => void;
};

export function UserTooltip(props: UserTooltipProps) {
  const currentUserId = useUserId();
  const { replaceOrInsertSplit } = useSplitLayout();

  const openDM = async (e: PointerEvent | MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (props.id) {
      try {
        const result = await commsServiceClient.getOrCreateDirectMessage({
          recipient_id: props.id,
        });
        const channelId = isOk(result) && result[1]?.channel_id;
        if (channelId) {
          replaceOrInsertSplit({
            type: 'channel',
            id: channelId,
          });
        } else {
          toast.failure('Failed to open direct message');
        }
      } catch {
        toast.failure('Failed to open direct message');
      }
    }
  };

  const createAndOpenTask = async (e: PointerEvent | MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (props.id) {
      try {
        const documentId = await createTask({
          propertyValues: [{
            propertyId: SYSTEM_PROPERTY_IDS.ASSIGNEES,
            value: {
              type: 'multi_entity_reference',
              references: [
                {
                  entity_id: props.id,
                  entity_type: EntityType.USER,
                },
              ],
            },
          }]
        });
        if (documentId) {
          replaceOrInsertSplit({
            type: 'task',
            id: documentId,
          });
        } else {
          toast.failure('Failed to create task');
        }
      } catch {
        toast.failure('Failed to create task');
      }
    }
  };

  const fiducialSquares = () => {
    return (<div class="flex flex-col justify-between h-full">
      <div class="flex-col py-2 space-y-4">
        <Square class="size-1 text-accent border-1"/>
        <Square class="size-1 text-accent border-1"/>
      </div>
      <Square class="size-1 text-accent border-1"/>
      <div class="flex-col py-2 space-y-4">
        <Square class="size-1 text-accent border-1"/>
        <Square class="size-1 text-accent border-1"/>
      </div>
    </div>);
  };

  return (
    <div class="h-40 w-64">
      <div class="flex">
        <div class="px-2 font-mono bg-accent text-panel text-xs">
          USER INFO
        </div>
        <RightTriangle class="text-accent size-4"/>
      </div>
      <div class="bg-panel/90 text-ink border-t-1 border-b-1 border-accent overflow-hidden h-full w-full">
        <div class="flex justify-between h-full w-full">
          {fiducialSquares()}
          <div class="w-full">
            <div class="flex items-center gap-2 p-2 w-full">
              <div class="size-8 shrink-0 rounded-full bg-ink-extra-muted text-accent pointer-events-none">
                <Switch>
                  <Match when={props.isDeleted}>
                    <div class="size-8 shrink-0 rounded-full bg-ink-extra-muted/50 flex items-center justify-center">
                      <Trash class="w-4 h-4 shrink-0" />
                    </div>
                  </Match>
                  <Match when={props.id}>
                    <ProfilePicture
                      id={props.id}
                      sizeClass={{
                        container: 'size-8',
                        icon: 'w-4 h-4',
                        text: 'text-lg leading-none',
                      }}
                    />
                  </Match>
                  <Match when={!props.id && props.email}>
                    <ProfilePicture
                      id={undefined}
                      email={props.email}
                      sizeClass={{
                        container: 'size-8',
                        icon: 'w-4 h-4',
                        text: 'text-lg leading-none',
                      }}
                    />
                  </Match>
                </Switch>
              </div>

              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-accent truncate">
                  {props.displayName}
                </div>
                <Show when={props.email && props.email !== props.displayName}>
                  <div class="text-xs text-accent opacity-60 mt-0.5 truncate">
                    {props.email}
                  </div>
                </Show>
              </div>
            </div>

            <Show when={props.email || props.id}>
              <div class="border-t border-accent/20"></div>
              <div class="p-2 flex flex-col gap-0">
                <Show when={props.email}>
                  <Button
                    onClick={props.onCopyEmail}
                    class="text-xs text-accent w-full justify-start hover:bg-accent/20"
                  >
                    {props.copied ? (
                      <IconCheck class="w-3.5 h-3.5" />
                    ) : (
                      <WideCopy class="w-3.5 h-3.5" />
                    )}
                    Copy email
                  </Button>
                </Show>
                <Show
                  when={props.id && !props.isDeleted && props.id !== currentUserId()}
                >
                  <Button
                    onClick={openDM}
                    class="text-xs text-accent w-full justify-start hover:bg-accent/20"
                  >
                    <WideChat class="w-3.5 h-3.5" />
                    DM
                  </Button>
                </Show>
                <Show
                  when={props.id && !props.isDeleted && props.id !== currentUserId()}
                >
                  <Button
                    onClick={createAndOpenTask}
                    class="text-xs text-accent w-full justify-start hover:bg-accent/20"
                  >
                    <WideTask class="w-3.5 h-3.5" />
                    Assign Task
                  </Button>
                </Show>
              </div>
            </Show>
          </div>
        {fiducialSquares()}
        </div>
        <div class="isolate relative opacity-5 pointer-events-none">
          <div class="-right-12 -bottom-16 absolute h-56 w-56 rounded-full bg-accent">
          </div>
          <div class="-right-12 -bottom-16 absolute grayscale mix-blend-multiply">
            <ProfilePicture
              id={props.id}
              sizeClass={{
                container: 'size-56',
                icon: 'w-16 h-16 bg-panel',
                text: 'text-lg leading-none',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
