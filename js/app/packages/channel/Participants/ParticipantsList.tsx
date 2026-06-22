import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { type Accessor, createSignal, type JSX, Show } from 'solid-js';
import { VList } from 'virtua/solid';
import { ParticipantsEmptyState } from './ParticipantsEmptyState';
import { ParticipantsListItem } from './ParticipantsListItem';

export type ParticipantsListItemData = {
  id: string;
  displayName: string;
  role: string;
  avatarUrl?: string | null;
  secondaryText?: string | null;
};

export function ParticipantsList(props: {
  items: Accessor<ParticipantsListItemData[]>;
  emptyState?: JSX.Element;
  searchQuery: Accessor<string>;
  currentUserId?: string;
  editable: boolean;
  onParticipantClick: (participantId: string) => void | Promise<void>;
  onRemoveParticipant: (participantId: string) => void;
}) {
  const [listWrapperRef, setListWrapperRef] = createSignal<HTMLDivElement>();

  const scrollContainer = () => {
    const el = listWrapperRef();
    if (!el) return undefined;
    return (
      (el.querySelector(
        '[data-participants-list-container]'
      ) as HTMLElement | null) ?? undefined
    );
  };

  const isLastParticipant = (index: number) =>
    index === props.items().length - 1;
  const hasContent = () => props.items().length > 0;

  return (
    <Show
      when={hasContent()}
      fallback={
        props.emptyState ?? (
          <ParticipantsEmptyState searchQuery={props.searchQuery()} />
        )
      }
    >
      <div ref={setListWrapperRef} class="relative h-full min-h-0">
        <VList
          data={props.items()}
          class="h-full scrollbar-hidden"
          style={{
            height: '100%',
            width: '100%',
          }}
          bufferSize={500}
          data-participants-list-container
        >
          {(item, index) => (
            <ParticipantsListItem
              item={item}
              isLast={isLastParticipant(index())}
              currentUserId={props.currentUserId}
              editable={props.editable}
              onClick={() => props.onParticipantClick(item.id)}
              onRemove={() => props.onRemoveParticipant(item.id)}
            />
          )}
        </VList>
        <CustomScrollbar scrollContainer={scrollContainer} />
      </div>
    </Show>
  );
}
