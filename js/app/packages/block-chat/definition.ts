import { defineBlock, type ExtractLoadType, LoadErrors } from '@core/block';
import { Model } from '@core/component/AI/constant/model';
import {
  ChatLoadError,
  fetchChatLoad,
  prefetchChatLoad,
} from '@queries/cognition/chat-load';
import type { Entity } from '@service-cognition/generated/schemas/entity';
import type { GetChatResponse } from '@service-cognition/generated/schemas/getChatResponse';
import type { DocumentMetadata } from '@service-storage/generated/schemas/documentMetadata';
import { ok } from 'neverthrow';
import { lazy } from 'solid-js';

export const DEFAULT_CHAT_NAME = 'New Chat';

export type AttachmentWithoutId = Entity;

export const definition = defineBlock({
  name: 'chat',
  description: '',
  defaultFilename: DEFAULT_CHAT_NAME,
  // Lazy chunk: keeps this block's UI out of the entry bundle; the
  // definition itself stays eager for file-type routing.
  component: lazy(() => import('./component/Block')),
  liveTrackingEnabled: true,
  // Recently viewed chats keep their live tree (stream state included)
  // parked for instant reattach, like emails.
  keepAlive: true,
  async load(source, intent) {
    if (source.type === 'dss') {
      const chatId = source.id;

      if (intent === 'preload') {
        // Warm the cache without blocking; the real open reuses it.
        void prefetchChatLoad(chatId);
        return ok({
          type: 'preload',
          origin: source,
        });
      }

      // Through the query client: cache-first within the stale window,
      // warmed by the opportunistic prefetch, persisted to IDB via the
      // 'chats' scope (with offline fallback to the last known payload).
      let chat: GetChatResponse;
      try {
        chat = await fetchChatLoad(chatId);
      } catch (error) {
        if (
          error instanceof ChatLoadError &&
          error.codes.includes('UNAUTHORIZED')
        ) {
          return LoadErrors.INVALID;
        }
        return LoadErrors.MISSING;
      }

      return ok({
        ...chat,
        allModels: Object.values(Model),
        documentMetadata: {
          documentId: chat.chat.id,
          documentName: chat.chat.name,
          documentVersionId: 1,
          owner: chat.chat.userId,
          createdAt: chat.chat.createdAt,
          updatedAt: chat.chat.updatedAt,
          deletedAt: null,
          fileType: 'chat' as any,
        } satisfies DocumentMetadata,
      });
    }

    return LoadErrors.MISSING;
  },
  accepted: {},
});

export type ChatData = ExtractLoadType<(typeof definition)['load']>;
