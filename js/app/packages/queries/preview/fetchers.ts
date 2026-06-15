import { itemToSafeName } from '@core/constant/allBlocks';

import { cognitionApiServiceClient } from '@service-cognition/client';
import { emailClient } from '@service-email/client';
import { storageServiceClient } from '@service-storage/client';
import type { FileType } from '@service-storage/generated/schemas/fileType';
import { formatDocumentName } from '@service-storage/util/filename';
import { match } from 'ts-pattern';
import { normalizeMessageSender } from '../channel/message-sender';
import type { ItemEntity, MessageContext, PreviewItem } from './types';

async function fetchChannelPreviews(
  channelIds: string[]
): Promise<PreviewItem[]> {
  const result = await storageServiceClient.getBatchChannelPreviews({
    channel_ids: channelIds,
  });

  if (result.isErr()) {
    console.error('Failed to fetch channel previews');
    return [];
  }

  const data = result.value;
  return data.previews.map((channel) => {
    const base = {
      id: channel.channel_id,
      type: 'channel',
    } as const;

    return match<typeof channel, PreviewItem>(channel)
      .with({ type: 'access' }, (c) => ({
        ...base,
        access: 'access' as const,
        loading: false,
        rawName: c.channel_name,
        name: c.channel_name,
        channelType: c.channel_type,
      }))
      .with({ type: 'no_access' }, (c) => ({
        ...base,
        access: c.type,
        loading: false,
      }))
      .with({ type: 'does_not_exist' }, (c) => ({
        ...base,
        access: c.type,
        loading: false,
      }))
      .exhaustive();
  });
}

export async function fetchMessageContext(
  channelId: string,
  messageId: string,
  signal?: AbortSignal
): Promise<MessageContext | null> {
  const msgResult = await storageServiceClient.getMessageWithContext({
    channel_id: channelId,
    message_id: messageId,
    signal,
  });

  if (msgResult.isErr()) {
    return null;
  }

  const msgData = msgResult.value;
  const message = msgData.messages[0];

  if (!message) {
    return null;
  }

  return normalizeMessageSender(message);
}

async function fetchDocumentPreviews(ids: string[]): Promise<PreviewItem[]> {
  const result = await storageServiceClient.getBatchDocumentPreviews({
    document_ids: ids,
  });

  if (result.isErr()) {
    console.error('Failed to fetch document previews');
    return [];
  }

  const data = result.value;
  return data.previews.map((doc) => {
    const base = {
      id: doc.document_id,
      type: 'document',
    } as const;

    return match<typeof doc, PreviewItem>(doc)
      .with({ type: 'access' }, (d) => ({
        ...base,
        access: 'access' as const,
        loading: false,
        rawName: d.document_name,
        name: d.document_name,
        fileType: d.file_type as FileType,
        owner: d.owner,
        updatedAt: d.updated_at,
        subType:
          d.sub_type === null || d.sub_type === undefined
            ? undefined
            : {
                type: d.sub_type.type,
                is_completed:
                  'is_completed' in d.sub_type
                    ? d.sub_type.is_completed
                    : undefined,
              },
      }))
      .with({ type: 'no_access' }, (d) => ({
        ...base,
        access: d.type,
        loading: false,
      }))
      .with({ type: 'does_not_exist' }, (d) => ({
        ...base,
        access: d.type,
        loading: false,
      }))
      .exhaustive();
  });
}

async function fetchCallPreviews(ids: string[]): Promise<PreviewItem[]> {
  const result = await storageServiceClient.getBatchCallPreviews({
    call_ids: ids,
  });

  if (result.isErr()) {
    console.error('Failed to fetch call previews');
    return [];
  }

  const data = result.value;
  return data.previews.map((call) => {
    const base = {
      id: call.callId,
      type: 'call',
    } as const;

    return match<typeof call, PreviewItem>(call)
      .with({ type: 'exists' }, (c) => {
        // Match the call block (CallRecordingSplitHeader / CallRecordingBody):
        // prefer the user-supplied / AI-generated `customName`, fall back to
        // the channel the call lives in.
        const displayName = c.customName ?? c.channelName;
        return {
          ...base,
          access: 'access' as const,
          loading: false,
          rawName: displayName ?? '',
          name: displayName ?? 'Unknown Call',
          updatedAt: c.startedAt,
        };
      })
      .with({ type: 'does_not_exist' }, (c) => ({
        ...base,
        access: c.type,
        loading: false,
      }))
      .exhaustive();
  });
}

async function fetchChatPreviews(ids: string[]): Promise<PreviewItem[]> {
  const result = await cognitionApiServiceClient.getBatchChatPreviews({
    chat_ids: ids,
  });

  if (result.isErr()) {
    console.error('Failed to fetch chat previews');
    return [];
  }

  const data = result.value;
  return data.previews.map((chat) => {
    const base = {
      id: chat.chat_id,
      type: 'chat',
    } as const;

    return match<typeof chat, PreviewItem>(chat)
      .with({ type: 'access' }, (c) => ({
        ...base,
        access: 'access' as const,
        loading: false,
        rawName: c.chat_name,
        name: c.chat_name,
        owner: c.owner,
        updatedAt: c.updated_at,
      }))
      .with({ type: 'no_access' }, (c) => ({
        ...base,
        access: c.type,
        loading: false,
      }))
      .with({ type: 'does_not_exist' }, (c) => ({
        ...base,
        access: c.type,
        loading: false,
      }))
      .exhaustive();
  });
}

async function fetchProjectPreviews(
  projectIds: string[]
): Promise<PreviewItem[]> {
  const result = await storageServiceClient.projects.getPreview({
    projectIds,
  });

  if (result.isErr()) {
    console.error('Failed to fetch projects previews');
    return [];
  }

  return result.value.previews.map((preview) => {
    const { updatedAt, ...rest } = preview as Extract<
      typeof preview,
      { updatedAt?: unknown }
    >;
    return {
      type: 'project' as const,
      loading: false as const,
      ...rest,
      rawName: rest.name,
      updatedAt,
    };
  });
}

/**
 * Fetches CRM company previews via `GET /crm/companies/{id}`. Mirrors the
 * email preview fetcher's shape — N parallel REST calls rather than a
 * batch endpoint, since the CRM REST surface is per-id today and
 * companies are a smaller cardinality than mentions in flight.
 *
 * The backend already gates hidden visibility by role (admin/owner sees
 * hidden, non-admin 404s), so the fetcher doesn't need to repeat that
 * logic.
 */
async function fetchCrmCompanyPreviews(
  companyIds: string[]
): Promise<PreviewItem[]> {
  return await Promise.all(
    companyIds.map(async (id) => {
      const base = { id, type: 'crm_company' as const };
      const result = await storageServiceClient.getCompany({ companyId: id });

      if (result.isErr()) {
        // The backend returns 404 for every unreachable reason (wrong
        // team, hidden+member, doesn't exist) — deliberate, so existence
        // can't be probed across teams. Maps to "No Access" for parity
        // with the email fetcher's per-id convention; "Deleted" would be
        // misleading since we can't actually tell.
        return {
          ...base,
          access: 'no_access' as const,
          loading: false as const,
        };
      }

      const company = result.value;
      const displayName =
        company.name ?? company.domains[0]?.domain ?? 'Unknown Company';

      return {
        ...base,
        access: 'access' as const,
        loading: false as const,
        rawName: displayName,
        name: displayName,
        updatedAt: company.updatedAt,
      };
    })
  );
}

async function fetchEmailPreviews(threadIds: string[]): Promise<PreviewItem[]> {
  const results = await Promise.all(
    threadIds.map(async (threadId) => {
      const result = await emailClient.getThread({
        thread_id: threadId,
        offset: 0,
        limit: 1,
      });

      const base = {
        id: threadId,
        type: 'email',
      } as const;

      if (result.isErr()) {
        return {
          ...base,
          access: 'no_access' as const,
          loading: false as const,
        };
      }

      const data = result.value;
      const firstMessage = data.thread.messages[0];
      const subject = firstMessage?.subject ?? 'No Subject';
      const sender =
        firstMessage?.from?.email ?? firstMessage?.from?.name ?? undefined;

      return {
        ...base,
        access: 'access' as const,
        loading: false as const,
        rawName: subject,
        name: subject,
        owner: sender as string | undefined,
        updatedAt: data.thread.updated_at,
      };
    })
  );

  return results;
}

function filterMapToId(items: Array<ItemEntity>, type: ItemEntity['type']) {
  return items.filter((i) => i.type === type).map(({ id }) => id);
}

function doFetch(
  fetcher: (ids: string[]) => Promise<PreviewItem[]>,
  ids: string[]
) {
  if (ids.length > 0) return fetcher(ids);
  return Promise.resolve([]);
}

export async function fetchPreviewBatch(
  items: ItemEntity[]
): Promise<Map<string, PreviewItem>> {
  const results = await Promise.all([
    doFetch(fetchChatPreviews, filterMapToId(items, 'chat')),
    doFetch(fetchCallPreviews, filterMapToId(items, 'call')),
    doFetch(fetchChannelPreviews, filterMapToId(items, 'channel')),
    doFetch(fetchDocumentPreviews, filterMapToId(items, 'document')),
    doFetch(fetchProjectPreviews, filterMapToId(items, 'project')),
    doFetch(fetchEmailPreviews, filterMapToId(items, 'email')),
    doFetch(fetchCrmCompanyPreviews, filterMapToId(items, 'crm_company')),
  ]);
  const resultMap = new Map<string, PreviewItem>();
  results.flat().forEach((result) => {
    resultMap.set(result.id, result);
  });
  return resultMap;
}

export function defaultNameTransform(item: PreviewItem): PreviewItem {
  if (item.loading) return item;
  if (item.access !== 'access') return item;
  const rawName = item.rawName === '' ? itemToSafeName(item) : item.rawName;
  const fileType = 'fileType' in item ? item.fileType : undefined;
  const name = formatDocumentName(rawName, fileType, {
    fullyQualifiedBlockName: true,
  });
  return { ...item, rawName, name };
}
