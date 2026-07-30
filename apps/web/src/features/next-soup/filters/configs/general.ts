import {
  explicitNoiseFilter,
  noiseFilter,
  signalFilter,
} from '../inbox-filters';
import {
  notDoneFilter as notDonePredicate,
  sharedEntity as sharedEntityPredicate,
  unreadFilter as unreadPredicate,
} from '../predicates';
import { config, NIL_UUID } from './base';

export const inboxFilter = config({
  id: 'inbox',
  group: 'focus',
  predicate: (e, ctx) =>
    signalFilter(e) &&
    (ctx.notificationSource
      ? notDonePredicate(ctx.notificationSource)(e)
      : false),
  query: {
    include: {
      documentDone: false,
      emailDone: false,
      emailImportance: true,
      channelDone: false,
      // Signal only surfaces channels the user is actually in; without this
      // the query would also match team channels they have not joined once
      // the backend widens the candidate set for participation-aware filters.
      channelIsParticipant: [true],
      channelThreadDone: false,
      chatDone: false,
      folderDone: false,
      foreignEntitySource: ['github_pull_request'],
      foreignEntityDone: false,
    },
    emailView: 'inbox',
  },
});

export const noiseFilterDef = config({
  id: 'noise',
  group: 'focus',
  predicate: (e) => noiseFilter(e),
  query: {
    include: {
      documentDone: false,
      emailDone: false,
      emailImportance: false,
      channelDone: false,
      channelThreadDone: false,
      chatDone: false,
      folderDone: false,
    },
    emailView: 'inbox',
  },
});

export const explicitNoiseFilterDef = config({
  id: 'explicit-noise',
  group: 'focus',
  predicate: (e) => !explicitNoiseFilter(e),
  query: {
    exclude: {
      documentId: [NIL_UUID],
      channelId: [NIL_UUID],
      chatId: [NIL_UUID],
      folderId: [NIL_UUID],
      threadId: [NIL_UUID],
    },
    emailView: 'all',
  },
});

export const unreadFilter = config({
  id: 'unread',
  predicate: (e, ctx) =>
    ctx.notificationSource ? unreadPredicate(ctx.notificationSource)(e) : false,
  query: {
    include: {
      documentSeen: false,
      emailSeen: false,
      channelSeen: false,
      channelThreadSeen: false,
      chatSeen: false,
      folderSeen: false,
    },
  },
});

export const readFilter = config({
  id: 'read',
  predicate: (e, ctx) =>
    ctx.notificationSource
      ? !unreadPredicate(ctx.notificationSource)(e)
      : false,
  query: {
    include: {
      documentSeen: true,
      emailSeen: true,
      channelSeen: true,
      channelThreadSeen: true,
      chatSeen: true,
      folderSeen: true,
    },
  },
});

export const notDoneFilter = config({
  id: 'not-done',
  predicate: (e, ctx) =>
    ctx.notificationSource
      ? notDonePredicate(ctx.notificationSource)(e)
      : false,
  query: {
    include: {
      documentDone: false,
      emailDone: false,
      channelDone: false,
      channelThreadDone: false,
      chatDone: false,
      folderDone: false,
    },
  },
});

export const doneFilter = config({
  id: 'done',
  predicate: (e, ctx) =>
    ctx.notificationSource
      ? !notDonePredicate(ctx.notificationSource)(e)
      : false,
  query: {
    include: {
      documentDone: true,
      emailDone: true,
      channelDone: true,
      channelThreadDone: true,
      chatDone: true,
      folderDone: true,
    },
  },
});

export const sharedEntityFilter = config({
  id: 'shared-entity',
  predicate: (e, ctx) => sharedEntityPredicate(() => ctx.userId)(e),
  query: (ctx) => ({
    exclude: {
      documentOwnerId: [ctx.userId ?? ''],
      chatOwnerId: [ctx.userId ?? ''],
      folderOwnerId: [ctx.userId ?? ''],
    },
  }),
});

export const ownedEntityFilter = config({
  id: 'owned-entity',
  predicate: (e, ctx) => !sharedEntityPredicate(() => ctx.userId)(e),
  query: (ctx) => ({
    include: {
      documentOwnerId: [ctx.userId ?? ''],
      chatOwnerId: [ctx.userId ?? ''],
      folderOwnerId: [ctx.userId ?? ''],
    },
  }),
});

/**
 * Docs, tasks, and agents the user created — the "my work" half of the
 * inbox Default tab (the `inbox` filter is its signal half; the two combine
 * as or-predicates). Scoped to documents and chats on purpose so channels
 * or calls the user happens to own don't ride along.
 */
export const myWorkFilter = config({
  id: 'my-work',
  predicate: (e, ctx) =>
    (e.type === 'document' || e.type === 'chat') &&
    ctx.userId !== undefined &&
    e.ownerId === ctx.userId,
  query: (ctx) => ({
    include: {
      documentOwnerId: [ctx.userId ?? ''],
      chatOwnerId: [ctx.userId ?? ''],
    },
  }),
});

/**
 * Channels (including DMs) whose latest root message the user sent — the
 * "conversations I just messaged" slice of the inbox Default tab. Sending a
 * message produces no notification for the sender, so the notification-driven
 * `inbox` predicate alone would drop the conversation from the feed the
 * moment its other notifications are done.
 */
export const myMessagesFilter = config({
  id: 'my-messages',
  predicate: (e, ctx) =>
    e.type === 'channel' &&
    ctx.userId !== undefined &&
    e.latestRootMessage?.senderId === ctx.userId,
  query: {
    include: { channelIsParticipant: [true] },
  },
});
