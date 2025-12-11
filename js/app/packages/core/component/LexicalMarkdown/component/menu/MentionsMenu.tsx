import {
  type BlockAlias,
  type BlockName,
  useMaybeBlockId,
  useMaybeBlockName,
} from '@core/block';
import { SUPPORTED_CHAT_ATTACHMENT_BLOCKS } from '@core/component/AI/constant/fileType';
import { BozzyBracketInnerSibling } from '@core/component/BozzyBracket';
import { useChannelsContext } from '@core/component/ChannelsProvider';
import { EntityIcon } from '@core/component/EntityIcon';
import { type PortalScope, ScopedPortal } from '@core/component/ScopedPortal';
import { UserIcon } from '@core/component/UserIcon';
import { fileTypeToBlockName } from '@core/constant/allBlocks';
import { ENABLE_CHAT_CHANNEL_ATTACHMENT } from '@core/constant/featureFlags';
import clickOutside from '@core/directive/clickOutside';
import { trackMention } from '@core/signal/mention';
import {
  type ChannelWithParticipants,
  type IUser,
  useContacts,
} from '@core/user';
import { getDateSuggestions, type ParsedDate } from '@core/util/dateParser';
import { createFreshSearch } from '@core/util/freshSort';
import ClockIcon from '@icon/regular/clock.svg';
import EmailIcon from '@icon/regular/envelope.svg';
import {
  type ChannelEntity,
  type ChatEntity,
  createUnifiedSearchInfiniteQuery,
  type DocumentEntity,
  type EmailEntity,
  type EntityData,
  type ProjectEntity,
  useEmails,
  type WithSearch,
} from '@macro-entity';
import type { DocumentMentionMetadata } from '@service-notification/client';
import type { PaginatedSearchArgs } from '@service-search/client';
import { storageServiceClient } from '@service-storage/client';
import type { Item } from '@service-storage/generated/schemas/item';
import { useHistory } from '@service-storage/history';
import { debounce } from '@solid-primitives/scheduled';
import { globalSplitManager } from 'app/signal/splitLayout';
import type { LexicalEditor } from 'lexical';
import type { List } from 'lodash';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSXElement,
  onCleanup,
  onMount,
  type ParentProps,
  Show,
  untrack,
} from 'solid-js';
import { v7 } from 'uuid';
import { floatWithElement } from '../../directive/floatWithElement';
import { floatWithSelection } from '../../directive/floatWithSelection';
import {
  CLOSE_INLINE_SEARCH_COMMAND,
  INSERT_DATE_MENTION_COMMAND,
  INSERT_DOCUMENT_MENTION_COMMAND,
  INSERT_USER_MENTION_COMMAND,
  REMOVE_INLINE_SEARCH_COMMAND,
} from '../../plugins';
import type { MenuOperations } from '../../shared/inlineMenu';

false && clickOutside;
false && floatWithSelection;
false && floatWithElement;

/** The total number of max items in the menu. */
const MAX_ITEMS = 8;

/** Whether to filter sidebar non-persistent-chats */
const ONLY_REAL_CHATS = false;

export type UserMentionRecord = {
  documentId: string;
  mentions: string[];
  metadata: DocumentMentionMetadata;
};

// Extended types for mentions that aren't in EntityData
type UserEntity = {
  type: 'user';
  id: string;
  name: string;
  email: string;
  ownerId: string;
};

type DateEntity = {
  type: 'date';
  id: string;
  name: string;
  ownerId: string;
  date: Date;
  displayFormat: string;
};

// Union type for all mentionable entities
type MentionEntity =
  | ChannelEntity
  | ChatEntity
  | DocumentEntity
  | EmailEntity
  | ProjectEntity
  | UserEntity
  | DateEntity;

// Document-like entities (items that can be mentioned as documents)
type DocumentLikeEntity =
  | ChannelEntity
  | ChatEntity
  | DocumentEntity
  | ProjectEntity;

// Converters from legacy types to new entity types
const userToEntity = (user: IUser): UserEntity => ({
  type: 'user',
  id: user.id,
  name: user.name ?? user.email,
  email: user.email,
  ownerId: user.id,
});

const channelToEntity = (channel: ChannelWithParticipants): ChannelEntity => ({
  type: 'channel',
  id: channel.id,
  name: channel.name ?? '',
  ownerId: channel.owner_id ?? '',
  channelType: channel.channel_type,
  participantIds: channel.participants?.map((p) => p.user_id),
});

const itemToEntity = (
  item: Item
): DocumentEntity | ChatEntity | ProjectEntity => {
  if (item.type === 'chat') {
    return {
      type: 'chat',
      id: item.id,
      name: item.name,
      ownerId: item.userId,
      projectId: item.projectId ?? undefined,
    };
  }
  if (item.type === 'project') {
    return {
      type: 'project',
      id: item.id,
      name: item.name,
      ownerId: item.userId,
      parentId: item.parentId ?? undefined,
    };
  }
  return {
    type: 'document',
    id: item.id,
    name: item.name,
    ownerId: item.owner,
    fileType: item.fileType ?? undefined,
    subType: item.subType ?? undefined,
    projectId: item.projectId ?? undefined,
  };
};

const parsedDateToEntity = (parsed: ParsedDate): DateEntity => ({
  type: 'date',
  id: `date-${parsed.date.toISOString()}`,
  name: parsed.displayFormat,
  ownerId: '',
  date: parsed.date,
  displayFormat: parsed.displayFormat,
});

const getUserDisplayName = (entity: UserEntity): string => {
  if (entity.name === entity.email) return entity.email;
  return `${entity.name} | ${entity.email}`;
};

const getUserSearchText = (entity: UserEntity): string => {
  if (entity.name === entity.email) return `${entity.email} | ${entity.email}`;
  return `${entity.name} | ${entity.email}`;
};

const getEntityBlockName = (
  entity: MentionEntity,
  forIcon?: boolean
): BlockName | BlockAlias => {
  switch (entity.type) {
    case 'document':
      return fileTypeToBlockName(entity.subType || entity.fileType, forIcon);
    case 'chat':
      return 'chat';
    case 'project':
      return 'project';
    case 'channel':
      return 'channel';
    case 'email':
      return 'email';
    case 'user':
      return 'unknown';
    case 'date':
      return 'unknown';
    default:
      return 'unknown';
  }
};

const getEntityDisplayName = (entity: MentionEntity): string => {
  switch (entity.type) {
    case 'user':
      return getUserDisplayName(entity);
    case 'date':
      return entity.displayFormat;
    case 'email':
      return entity.name ?? 'No Subject';
    default:
      return entity.name ?? '';
  }
};

const getEntitySearchText = (entity: MentionEntity): string => {
  switch (entity.type) {
    case 'user':
      return getUserSearchText(entity);
    case 'date':
      return entity.displayFormat;
    case 'email':
      return entity.name ?? 'No Subject';
    default:
      return entity.name ?? '';
  }
};

/**
 * Filter function for Item objects (legacy).
 */
function allItemFilterLegacy(item: Item): boolean {
  if (ONLY_REAL_CHATS && item.type === 'chat' && item.isPersistent) {
    return false;
  }
  if (item.deletedAt) {
    return false;
  }
  return true;
}

/**
 * Dependencies for handling mentions.
 */
type HandlerDependencies = {
  editor: LexicalEditor;
  blockName?: BlockName;
  blockId?: string;
  onUserMention?: (record: UserMentionRecord) => void;
  onDocumentMention?: (item: Item | ChannelWithParticipants) => void;
  disableMentionTracking?: boolean;
  onEmailMention?: (item: EmailEntity) => void;
};

/**
 * Handles user mentions.
 */
async function handleUserMention(
  entity: UserEntity,
  dependencies: HandlerDependencies
) {
  const { editor, blockName, blockId, onUserMention, disableMentionTracking } =
    dependencies;
  let mentionId: string | undefined;

  if (blockName !== 'channel') {
    if (blockId) {
      const record: UserMentionRecord = {
        documentId: blockId,
        mentions: [entity.id],
        metadata: {
          mention_id: v7(),
        },
      };
      if (onUserMention) {
        onUserMention(record);
      } else {
        storageServiceClient.upsertUserMentions(record);
      }
      if (!disableMentionTracking) {
        mentionId = await trackMention(blockId, 'user', entity.id);
      }
    }
  }

  editor.dispatchCommand(INSERT_USER_MENTION_COMMAND, {
    userId: entity.id,
    email: entity.email,
    mentionUuid: mentionId,
  });
}

/**
 * Handles date mentions.
 */
async function handleDateMention(
  entity: DateEntity,
  dependencies: HandlerDependencies
) {
  const { editor } = dependencies;
  editor.dispatchCommand(INSERT_DATE_MENTION_COMMAND, {
    date: entity.date.toISOString(),
    displayFormat: entity.displayFormat,
  });
}

/**
 * Handles email mentions.
 */
async function handleEmailMention(
  entity: EmailEntity,
  dependencies: HandlerDependencies
) {
  const {
    editor,
    blockName: parentBlockName,
    blockId,
    onEmailMention,
    disableMentionTracking,
  } = dependencies;
  let mentionId: string | undefined;
  if (
    blockId &&
    parentBlockName !== 'channel' &&
    parentBlockName !== 'chat' &&
    !disableMentionTracking
  ) {
    mentionId = await trackMention(blockId, 'document', entity.id);
  }
  const itemName = entity.name ?? 'No Subject';

  onEmailMention?.(entity);

  editor.dispatchCommand(INSERT_DOCUMENT_MENTION_COMMAND, {
    documentId: entity.id,
    documentName: itemName,
    blockName: 'email',
    mentionUuid: mentionId,
  });
}

/**
 * Handles document/chat/project mentions.
 */
async function handleDocumentMention(
  entity: DocumentLikeEntity,
  item: Item,
  dependencies: HandlerDependencies
) {
  const {
    editor,
    blockName: parentBlockName,
    blockId,
    onDocumentMention,
    disableMentionTracking,
  } = dependencies;
  let mentionId: string | undefined;
  if (
    blockId &&
    parentBlockName !== 'channel' &&
    parentBlockName !== 'chat' &&
    !disableMentionTracking
  ) {
    mentionId = await trackMention(blockId, 'document', entity.id);
  }
  const itemBlock = getEntityBlockName(entity);
  const itemName = getEntityDisplayName(entity);

  onDocumentMention?.(item);

  editor.dispatchCommand(INSERT_DOCUMENT_MENTION_COMMAND, {
    documentId: entity.id,
    documentName: itemName,
    blockName: itemBlock,
    mentionUuid: mentionId,
  });
}

/**
 * Handles channel mentions.
 */
async function handleChannelMention(
  entity: ChannelEntity,
  channel: ChannelWithParticipants,
  dependencies: HandlerDependencies
) {
  const {
    editor,
    blockName: parentBlockName,
    blockId,
    onDocumentMention,
    disableMentionTracking,
  } = dependencies;
  let mentionId: string | undefined;
  if (
    blockId &&
    parentBlockName !== 'channel' &&
    parentBlockName !== 'chat' &&
    !disableMentionTracking
  ) {
    mentionId = await trackMention(blockId, 'channel', entity.id);
  }
  const itemBlock = getEntityBlockName(entity);
  const itemName = getEntityDisplayName(entity);

  onDocumentMention?.(channel);

  editor.dispatchCommand(INSERT_DOCUMENT_MENTION_COMMAND, {
    documentId: entity.id,
    documentName: itemName,
    blockName: itemBlock,
    mentionUuid: mentionId,
    channelType: entity.channelType,
  });
}

// Wrapper type to carry original data for callbacks
type MentionEntityWithSource<T extends MentionEntity = MentionEntity> = {
  entity: T;
  sourceItem?: Item;
  sourceChannel?: ChannelWithParticipants;
};

/**
 * Creates the universal item handler.
 */
function createItemHandler(dependencies: HandlerDependencies) {
  return async (wrapper: MentionEntityWithSource) => {
    if (!wrapper) return;
    dependencies.editor.dispatchCommand(
      REMOVE_INLINE_SEARCH_COMMAND,
      undefined
    );
    const { entity, sourceItem, sourceChannel } = wrapper;
    switch (entity.type) {
      case 'user':
        return await handleUserMention(entity, dependencies);
      case 'date':
        return await handleDateMention(entity, dependencies);
      case 'email':
        return await handleEmailMention(entity, dependencies);
      case 'channel':
        if (sourceChannel) {
          return await handleChannelMention(
            entity,
            sourceChannel,
            dependencies
          );
        }
        break;
      case 'document':
      case 'chat':
      case 'project':
        if (sourceItem) {
          return await handleDocumentMention(entity, sourceItem, dependencies);
        }
        break;
    }
  };
}

/**
 * Styled container for single category.
 */
function ItemBin(
  props: ParentProps<{
    label: string;
    binType: MentionBins;
    isNextPage?: Accessor<boolean>;
    totalCount?: number;
    showingCount?: number;
    onViewAll?: (binType: MentionBins) => void;
    isSelected?: boolean;
  }>
) {
  const showViewAllButton = () => {
    return (
      (props.binType &&
        props.totalCount &&
        props.showingCount &&
        props.totalCount > props.showingCount) ||
      props.isNextPage?.()
    );
  };
  const viewAllText = () => {
    if (
      props.totalCount &&
      props.showingCount &&
      props.totalCount > props.showingCount
    )
      return `View all (${props.totalCount})`;
    return `View all`;
  };
  return (
    <>
      <div
        class={`text-xs font-medium p-2 pt-0 flex justify-between items-center ${
          props.isSelected ? 'text-ink-muted' : 'text-ink-extra-muted'
        }`}
      >
        <span class="flex items-center gap-1">
          {props.label}
          <Show when={props.isSelected && showViewAllButton()}> →</Show>
        </span>
        <Show when={showViewAllButton()}>
          <button
            type="button"
            class="text-xs font-medium hover:text-ink hover:underline"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.onViewAll?.(props.binType);
            }}
          >
            {viewAllText()}
          </button>
        </Show>
      </div>
      {props.children}
    </>
  );
}

/**
 * Calculate the correct number of items for each category.
 */
export function computeBins<T extends string>(
  bins: Record<T, number>,
  targetLength: number
): Record<T, number> {
  const total = Object.values<number>(bins).reduce(
    (sum, count) => sum + count,
    0
  );

  if (total === 0 || targetLength === 0) {
    return Object.fromEntries(
      Object.keys(bins).map((key) => [key, 0])
    ) as Record<T, number>;
  }

  const scaled = {} as Record<T, number>;
  const offsets = {} as Record<T, number>;

  const nonEmptyBins: Array<T> = Object.entries<number>(bins)
    .filter(([_, count]) => count > 0)
    .map(([key]) => key as T);

  let allocated = 0;

  for (const key in bins) {
    scaled[key] = 0;
    offsets[key] = 0;
  }

  for (const key of nonEmptyBins) {
    if (allocated < targetLength) {
      scaled[key] = 1;
      offsets[key] = allocated;
      allocated++;
    }
  }

  const remaining = targetLength - allocated;
  if (remaining > 0 && nonEmptyBins.length > 0) {
    const nonEmptyTotal = nonEmptyBins.reduce((sum, key) => sum + bins[key], 0);
    const remainders: { key: T; remainder: number }[] = [];

    for (const key of nonEmptyBins) {
      const proportion = bins[key] / nonEmptyTotal;
      const raw = proportion * remaining;
      const floor = Math.floor(raw);
      scaled[key] += floor;
      allocated += floor;
      remainders.push({ key, remainder: raw - floor });
    }

    const leftover = targetLength - allocated;
    remainders.sort((a, b) => b.remainder - a.remainder);

    for (let i = 0; i < leftover; i++) {
      const key = remainders[i % remainders.length].key;
      scaled[key]++;
    }
  }

  return scaled;
}

/** The current bins enum */
export type MentionBins = 'items' | 'users' | 'dates' | 'emails';

/** View all mode type */
type ViewAllMode = MentionBins | null;

/** Selected category type */
type SelectedCategory = MentionBins | null;

/**
 * Styled component for a single item.
 */
export function MentionsMenuItem(props: {
  item: MentionEntityWithSource;
  index: number;
  selected: boolean;
  itemAction: (item: MentionEntityWithSource) => void;
  setIndex: (index: number) => void;
  setOpen: (open: boolean) => void;
}) {
  let itemRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.selected && itemRef) {
      itemRef.scrollIntoView({ block: 'nearest' });
    }
  });

  const name = () => getEntityDisplayName(props.item.entity);

  const icon = () => {
    const entity = props.item.entity;
    switch (entity.type) {
      case 'user':
        return <UserIcon id={entity.id} size="sm" isDeleted={false} />;

      case 'date':
        return <ClockIcon class="size-4 text-ink-muted" />;

      case 'channel':
        return (
          <EntityIcon
            size="xs"
            targetType={
              entity.channelType === 'direct_message'
                ? 'directMessage'
                : entity.channelType === 'organization'
                  ? 'company'
                  : 'channel'
            }
          />
        );

      case 'document':
      case 'chat':
      case 'project':
        return (
          <EntityIcon targetType={getEntityBlockName(entity, true)} size="xs" />
        );
      case 'email':
        return <EmailIcon class="size-4 text-ink-muted" />;
    }
  };

  return (
    <div
      ref={itemRef}
      on:mouseup={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      on:mousedown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      on:click={(e) => {
        props.itemAction(props.item);
        props.setOpen(false);
        e.stopPropagation();
      }}
      on:mouseover={() => props.setIndex(props.index)}
      class="group flex items-center p-1.5 mx-1.5"
      classList={{ 'bg-active bracket': props.selected }}
    >
      <div class="mr-2">{icon()}</div>
      <span
        class="text-ink text-xs sm:text-sm font-medium grow overflow-hidden text-nowrap"
        style={{ 'text-overflow': 'ellipsis' }}
      >
        {name()}
      </span>
    </div>
  );
}

export function MentionsMenu(props: {
  editor: LexicalEditor;
  menu: MenuOperations;
  /** pass in custom history list if necessary */
  history?: Accessor<Item[]>;
  /** pass in a custom users list if necessary */
  users?: Accessor<IUser[]>;
  /** pass in a custom channels list if necessary */
  channels?: Accessor<ChannelWithParticipants[]>;
  /** pass in a custom emails list if necessary */
  emails?: Accessor<EmailEntity[]>;
  /** whether the menu checks against block boundary in floating middleware. uses floating-ui default if false. */
  useBlockBoundary?: boolean;
  portalScope?: PortalScope;
  block?: BlockName;
  anchor?: HTMLElement | null;
  onUserMention?: (mention: UserMentionRecord) => void;
  onDocumentMention?: (item: Item | ChannelWithParticipants) => void;
  onEmailMention?: (item: EmailEntity) => void;
  disableMentionTracking?: boolean;
}) {
  const [searchTerm, setSearchTerm] = createSignal<string>(
    props.menu.searchTerm()
  );
  const historyAccessor = props.history ?? useHistory();

  // Convert history items to entities with source tracking
  const history = createMemo(() => {
    return historyAccessor()
      .filter(allItemFilterLegacy)
      .map(
        (item): MentionEntityWithSource => ({
          entity: itemToEntity(item),
          sourceItem: item,
        })
      );
  });

  // Emails handling
  let emails: Accessor<MentionEntityWithSource<EmailEntity>[]>;
  if (props.emails) {
    emails = createMemo(
      () =>
        props.emails?.().map(
          (email): MentionEntityWithSource<EmailEntity> => ({
            entity: email,
          })
        ) ?? []
    );
  } else {
    const emailsFromSource = useEmails();
    emails = createMemo(() =>
      emailsFromSource().map(
        (email): MentionEntityWithSource<EmailEntity> => ({
          entity: email,
        })
      )
    );
  }

  const contacts = useContacts();

  // Users handling
  const users = createMemo(() => {
    const list = props.users?.() ?? contacts();
    return list.map(
      (user): MentionEntityWithSource<UserEntity> => ({
        entity: userToEntity(user),
      })
    );
  });

  // Channels handling
  let channels: Accessor<MentionEntityWithSource<ChannelEntity>[]>;
  if (props.channels) {
    channels = createMemo(
      () =>
        props.channels?.().map(
          (channel): MentionEntityWithSource<ChannelEntity> => ({
            entity: channelToEntity(channel),
            sourceChannel: channel,
          })
        ) ?? []
    );
  } else {
    const { channels: userChannels } = useChannelsContext();
    channels = createMemo(() => {
      if (!ENABLE_CHAT_CHANNEL_ATTACHMENT && props.block === 'chat') {
        return [];
      }
      return userChannels().map(
        (channel): MentionEntityWithSource<ChannelEntity> => ({
          entity: channelToEntity(channel),
          sourceChannel: channel,
        })
      );
    });
  }

  // Unified search for emails
  const args = createMemo((): PaginatedSearchArgs => {
    return {
      params: {
        page: 0,
        page_size: 10,
      },
      request: {
        match_type: 'partial',
        search_on: 'name',
        include: ['emails'],
        query: searchTerm(),
      },
    };
  });

  const emailUnifiedSearchInfiniteQuery =
    createUnifiedSearchInfiniteQuery(args);

  const foundEmails = createMemo((): MentionEntityWithSource<EmailEntity>[] => {
    if (emailUnifiedSearchInfiniteQuery.status === 'success') {
      function isEmail(
        e: WithSearch<EntityData>
      ): e is WithSearch<EmailEntity> {
        return e.type === 'email';
      }

      return emailUnifiedSearchInfiniteQuery.data.filter(isEmail).map(
        (email): MentionEntityWithSource<EmailEntity> => ({
          entity: email,
        })
      );
    } else {
      return [];
    }
  });

  // Get open tabs from split manager
  const openTabs = createMemo(() => {
    const splitManager = globalSplitManager();
    if (!splitManager) return [];

    const splits = splitManager.splits();
    const historyItems = history();
    const channelList = channels();
    const emailList = emails();

    const tabItems: MentionEntityWithSource[] = [];
    const seenKeys = new Set<string>();

    for (const split of splits) {
      if (
        split.content.type === 'component' ||
        (props.block === 'chat' &&
          !SUPPORTED_CHAT_ATTACHMENT_BLOCKS.includes(split.content.type))
      ) {
        continue;
      }

      const key = `${split.content.type}:${split.content.id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      if (split.content.type === 'channel') {
        const channel = channelList.find(
          (ch) => ch.entity.id === split.content.id
        );
        if (ENABLE_CHAT_CHANNEL_ATTACHMENT && channel) {
          tabItems.push(channel);
        }
      } else if (split.content.type === 'email') {
        const e = emailList.find((e) => e.entity.id === split.content.id);
        if (e) tabItems.push(e);
      } else {
        const historyItem = historyItems.find(
          (item) => item.entity.id === split.content.id
        );
        if (historyItem) {
          tabItems.push(historyItem);
        }
      }
    }

    return tabItems;
  });

  // Combined history and channels
  const historyAndChannels = createMemo(() => {
    const historyItems = history();
    const channelItems = channels();
    const currentBlockId = useMaybeBlockId();

    const itemMap = new Map<string, MentionEntityWithSource>();

    for (const item of historyItems) {
      if (!currentBlockId || item.entity.id !== currentBlockId) {
        itemMap.set(item.entity.id, item);
      }
    }

    for (const item of channelItems) {
      if (!currentBlockId || item.entity.id !== currentBlockId) {
        itemMap.set(item.entity.id, item);
      }
    }

    return Array.from(itemMap.values());
  });

  const [menuOpen, setMenuOpen] = [props.menu.isOpen, props.menu.setIsOpen];
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [viewAllMode, setViewAllMode] = createSignal<ViewAllMode>(null);

  let menuRef!: HTMLDivElement;

  const [mountSelection, setMountSelection] = createSignal<Selection | null>();

  const debouncedSetSearchTerm = debounce(
    (term: string) => setSearchTerm(term.toLowerCase()),
    60
  );

  createEffect(() => debouncedSetSearchTerm(props.menu.searchTerm()));

  // Search for items (documents, channels)
  const itemSearch = createFreshSearch<MentionEntityWithSource>({}, (wrapper) =>
    getEntitySearchText(wrapper.entity)
  );
  const filteredItems = createMemo(() => {
    const allResults = itemSearch(historyAndChannels(), searchTerm()).map(
      (result) => result.item
    );

    const openTabsSet = new Set(openTabs().map((item) => item.entity.id));
    const tabResults: MentionEntityWithSource[] = [];
    const otherResults: MentionEntityWithSource[] = [];

    for (const item of allResults) {
      if (openTabsSet.has(item.entity.id)) {
        tabResults.push(item);
      } else {
        otherResults.push(item);
      }
    }

    return [...tabResults, ...otherResults];
  });

  // Search for users
  const userSearch = createFreshSearch<MentionEntityWithSource<UserEntity>>(
    { timeWeight: 0, brevityWeight: 0.3 },
    (wrapper) => getEntitySearchText(wrapper.entity)
  );
  const filteredUsers = createMemo(() => {
    return userSearch(users(), searchTerm()).map((result) => result.item);
  });

  // Search for emails
  const emailSearch = createFreshSearch<MentionEntityWithSource<EmailEntity>>(
    { timeWeight: 0, brevityWeight: 0.3 },
    (wrapper) => getEntitySearchText(wrapper.entity)
  );

  const filteredEmails = createMemo(() => {
    const mail = emailSearch(emails(), searchTerm()).map(
      (result) => result.item
    );

    const otherMail = foundEmails();

    // dedup / preserve order
    const ids = new Set(mail.map((e) => e.entity.id));
    return [...mail, ...otherMail.filter((e) => !ids.has(e.entity.id))];
  });

  // Date suggestions
  const dateSuggestions = createMemo(() => {
    const suggestions = getDateSuggestions(searchTerm());
    return suggestions.map(
      (suggestion): MentionEntityWithSource<DateEntity> => ({
        entity: parsedDateToEntity(suggestion),
      })
    );
  });

  // Raw bins store counts for all matching items
  const rawBins = createMemo<Record<MentionBins, number>>(() => ({
    users: filteredUsers().length,
    items: filteredItems().length,
    dates: dateSuggestions().length,
    emails: filteredEmails().length,
  }));

  // Limited and rounded count for each bucket
  const bins = createMemo(() => computeBins(rawBins(), MAX_ITEMS));

  // Combined items for display
  const combinedItems = createMemo<MentionEntityWithSource[]>(() => {
    const currentViewAllMode = viewAllMode();

    if (currentViewAllMode) {
      switch (currentViewAllMode) {
        case 'users':
          return filteredUsers();
        case 'items':
          return filteredItems();
        case 'dates':
          return dateSuggestions();
        case 'emails':
          return filteredEmails();
        default:
          return [];
      }
    }

    return [
      ...filteredUsers().slice(0, bins().users),
      ...filteredItems().slice(0, bins().items),
      ...dateSuggestions().slice(0, bins().dates),
      ...filteredEmails().slice(0, bins().emails),
    ];
  });

  const [escapeSpaceState, setEscapeSpaceState] = createSignal<
    'start' | 'single' | 'double' | null
  >('start');

  createEffect(() => {
    if (!menuOpen()) {
      setEscapeSpaceState('start');
      setViewAllMode(null);
    }
  });

  const selectedCategory = createMemo<SelectedCategory>(() => {
    if (viewAllMode()) return null;

    const index = selectedIndex();
    const { users, items, dates, emails } = bins();

    let currentIndex = 0;

    if (users > 0) {
      if (index < currentIndex + users) {
        return 'users';
      }
      currentIndex += users;
    }

    if (items > 0) {
      if (index < currentIndex + items) {
        return 'items';
      }
      currentIndex += items;
    }

    if (dates > 0) {
      if (index < currentIndex + dates) {
        return 'dates';
      }
      currentIndex += dates;
    }

    if (emails > 0) {
      if (index < currentIndex + emails) {
        return 'emails';
      }
    }

    return null;
  });

  const itemAction = createItemHandler({
    editor: props.editor,
    blockName: useMaybeBlockName(),
    blockId: useMaybeBlockId(),
    onUserMention: props.onUserMention,
    onDocumentMention: props.onDocumentMention,
    onEmailMention: props.onEmailMention,
    disableMentionTracking: props.disableMentionTracking,
  });

  createEffect(() => {
    if (props.anchor) return;
    if (menuOpen()) {
      setMountSelection(document.getSelection());
      setSelectedIndex(0);
    } else {
      setMountSelection(null);
    }
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!menuOpen()) return;

    const items = combinedItems();
    const selectedItem = items[selectedIndex()];

    const handleArrowDown = () => {
      setSelectedIndex((p) => {
        if (p >= combinedItems.length) {
          if (
            viewAllMode() === 'emails' &&
            emailUnifiedSearchInfiniteQuery.isFetching
          ) {
            return items.length - 1;
          } else {
            return (p + 1) % items.length;
          }
        } else {
          return p + 1;
        }
      });
    };

    switch (e.key) {
      case ' ':
        switch (escapeSpaceState()) {
          case 'double':
          case 'start':
            props.editor.dispatchCommand(
              CLOSE_INLINE_SEARCH_COMMAND,
              undefined
            );
            setMenuOpen(false);
            break;
          case 'single':
            setEscapeSpaceState('double');
            break;
          case null:
            setEscapeSpaceState('single');
            break;
        }
        break;

      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        if (viewAllMode()) {
          handleBackToAll();
        } else {
          props.editor.dispatchCommand(CLOSE_INLINE_SEARCH_COMMAND, undefined);
          setMenuOpen(false);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        handleArrowDown();
        break;

      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) =>
          prev - 1 < 0 ? items.length - 1 : prev - 1
        );
        break;

      case 'ArrowLeft':
        e.preventDefault();
        e.stopPropagation();
        if (viewAllMode()) {
          handleBackToAll();
        }
        break;

      case 'ArrowRight':
        e.preventDefault();
        e.stopPropagation();
        if (!viewAllMode()) {
          const currentCategory = selectedCategory();
          if (currentCategory) {
            const currentBins = bins();
            const currentRawBins = rawBins();
            const abbreviatedCount = currentBins[currentCategory];
            const fullCount = currentRawBins[currentCategory];
            if (
              abbreviatedCount < fullCount ||
              (emailUnifiedSearchInfiniteQuery.hasNextPage &&
                currentCategory === 'emails')
            ) {
              handleViewAll(currentCategory);
            }
          }
        }
        break;

      case 'Tab':
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
        } else {
          setSelectedIndex((prev) => (prev + 1) % items.length);
        }
        break;

      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        if (selectedItem) {
          itemAction(selectedItem);
        } else {
          props.editor.dispatchCommand(CLOSE_INLINE_SEARCH_COMMAND, undefined);
        }
        setSearchTerm('');
        setMenuOpen(false);
        break;

      default:
        setEscapeSpaceState(null);
        break;
    }
  };

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    onCleanup(() => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    });
  });

  const focusOut = () => {
    props.editor.dispatchCommand(CLOSE_INLINE_SEARCH_COMMAND, undefined);
    setMenuOpen(false);
  };

  onMount(() => {
    document.addEventListener('focusout', focusOut);
    onCleanup(() => {
      document.removeEventListener('focusout', focusOut);
    });
  });

  createEffect(() => {
    if (
      selectedIndex() >= combinedItems().length - 5 &&
      viewAllMode() === 'emails' &&
      emailUnifiedSearchInfiniteQuery.hasNextPage &&
      !emailUnifiedSearchInfiniteQuery.isFetching
    ) {
      emailUnifiedSearchInfiniteQuery.fetchNextPage();
    }
    if (selectedIndex() >= combinedItems().length) {
      setSelectedIndex(combinedItems().length - 1);
    }
  });

  const handleViewAll = (binType: MentionBins) => {
    setViewAllMode(binType);
    setSelectedIndex(0);
  };

  const handleBackToAll = () => {
    setViewAllMode(null);
    setSelectedIndex(0);
  };

  const hasOnlyOneCategory = createMemo(() => {
    const currentRawBins = rawBins();
    const categoriesWithMatches = Object.values(currentRawBins).filter(
      (count) => count > 0
    );
    return categoriesWithMatches.length === 1;
  });

  const inner = createMemo(() => {
    const currentViewAllMode = viewAllMode();

    // SINGLE BUCKET MODE
    if (currentViewAllMode) {
      const allItems = combinedItems();
      const totalLength = () => allItems.length;

      const renderViewAllOptions = createMemo(() => {
        const categoryLabel = {
          users: 'People',
          items: 'Documents & Channels',
          dates: 'Dates',
          emails: 'Emails',
        }[currentViewAllMode];

        return (
          <>
            <div class="px-2 pb-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-ink-muted">
                  {categoryLabel}
                </span>
                <button
                  type="button"
                  class="text-xs font-medium text-ink-muted hover:text-ink hover:underline cursor-pointer"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleBackToAll();
                  }}
                >
                  ←{' '}
                  {hasOnlyOneCategory()
                    ? 'Back to summary'
                    : 'Back to everything'}
                </button>
              </div>
            </div>
            <div class="max-h-64 overflow-y-auto">
              <For each={allItems}>
                {(item, i) => (
                  <MentionsMenuItem
                    item={item}
                    index={i()}
                    selected={i() === selectedIndex()}
                    itemAction={itemAction}
                    setIndex={setSelectedIndex}
                    setOpen={setMenuOpen}
                  />
                )}
              </For>
            </div>
          </>
        );
      });

      return (
        <Show
          when={totalLength() > 0}
          fallback={<div class="px-2 text-ink-extra-muted">No results</div>}
        >
          {renderViewAllOptions()}
        </Show>
      );
    }

    // NORMAL MODE
    const usersList = filteredUsers().slice(0, bins().users);
    const docs = filteredItems().slice(0, bins().items);
    const dates = dateSuggestions().slice(0, bins().dates);
    const emailList = filteredEmails().slice(0, bins().emails);
    const totalLength = () =>
      usersList.length + docs.length + dates.length + emailList.length;

    const renderOptions = createMemo(() => {
      const options = [];
      if (usersList.length > 0) {
        options.push(
          <ItemBin
            label="People"
            binType="users"
            totalCount={filteredUsers().length}
            showingCount={usersList.length}
            onViewAll={handleViewAll}
            isSelected={selectedCategory() === 'users'}
          >
            <For each={usersList}>
              {(item, i) => (
                <MentionsMenuItem
                  item={item}
                  index={i()}
                  selected={i() === selectedIndex()}
                  itemAction={itemAction}
                  setIndex={setSelectedIndex}
                  setOpen={setMenuOpen}
                />
              )}
            </For>
          </ItemBin>
        );
      }

      if (docs.length > 0) {
        options.push(
          <ItemBin
            label="Documents & Channels"
            binType="items"
            totalCount={filteredItems().length}
            showingCount={docs.length}
            onViewAll={handleViewAll}
            isSelected={selectedCategory() === 'items'}
          >
            <For each={docs}>
              {(item, i) => (
                <MentionsMenuItem
                  item={item}
                  index={usersList.length + i()}
                  selected={usersList.length + i() === selectedIndex()}
                  itemAction={itemAction}
                  setIndex={setSelectedIndex}
                  setOpen={setMenuOpen}
                />
              )}
            </For>
          </ItemBin>
        );
      }

      if (dates.length > 0) {
        options.push(
          <ItemBin
            label="Dates"
            binType="dates"
            totalCount={dateSuggestions().length}
            showingCount={dates.length}
            onViewAll={handleViewAll}
            isSelected={selectedCategory() === 'dates'}
          >
            <For each={dates}>
              {(item, i) => (
                <MentionsMenuItem
                  item={item}
                  index={usersList.length + docs.length + i()}
                  selected={
                    usersList.length + docs.length + i() === selectedIndex()
                  }
                  itemAction={itemAction}
                  setIndex={setSelectedIndex}
                  setOpen={setMenuOpen}
                />
              )}
            </For>
          </ItemBin>
        );
      }

      if (emailList.length > 0) {
        options.push(
          <ItemBin
            label="Emails"
            binType="emails"
            isNextPage={() => emailUnifiedSearchInfiniteQuery.hasNextPage}
            totalCount={filteredEmails().length}
            showingCount={emailList.length}
            onViewAll={handleViewAll}
            isSelected={selectedCategory() === 'emails'}
          >
            <For each={emailList}>
              {(item, i) => (
                <MentionsMenuItem
                  item={item}
                  index={usersList.length + docs.length + dates.length + i()}
                  selected={
                    usersList.length + docs.length + dates.length + i() ===
                    selectedIndex()
                  }
                  itemAction={itemAction}
                  setIndex={setSelectedIndex}
                  setOpen={setMenuOpen}
                />
              )}
            </For>
          </ItemBin>
        );
      }

      return options.map(
        (option: JSXElement, index: number, array: List<JSXElement>) => (
          <>
            {option}
            <Show when={index < array.length - 1}>
              <div class="w-full mt-4 border-b-1 border-edge mb-2" />
            </Show>
          </>
        )
      );
    });

    return (
      <Show
        when={totalLength() > 0}
        fallback={<div class="px-2 text-ink-extra-muted">No results</div>}
      >
        <div>{renderOptions()}</div>
      </Show>
    );
  });

  const clickOutsideHandler = (e: MouseEvent) => {
    e.stopPropagation();
    props.editor.dispatchCommand(CLOSE_INLINE_SEARCH_COMMAND, undefined);
    setMenuOpen(false);
  };

  const floatWithElementProps = () =>
    props.anchor
      ? {
          element: () => props.anchor,
          useBlockBoundary: props.useBlockBoundary,
        }
      : undefined;

  const floatWithSelectionProps = () =>
    !props.anchor
      ? {
          selection: untrack(mountSelection),
          reactiveOnContainer: props.editor.getRootElement(),
          useBlockBoundary: props.useBlockBoundary,
        }
      : undefined;

  return (
    <Show when={menuOpen()}>
      <ScopedPortal scope={props.portalScope}>
        <div
          class="w-96 cursor-default select-none z-modal-content"
          use:floatWithElement={floatWithElementProps()}
          use:floatWithSelection={floatWithSelectionProps()}
          use:clickOutside={clickOutsideHandler}
          ref={menuRef}
        >
          <div class="relative overflow-hidden ring-1 ring-edge bg-menu shadow-xl py-2">
            {inner()}
          </div>
          <BozzyBracketInnerSibling animOnOpen={true} />
        </div>
      </ScopedPortal>
    </Show>
  );
}
