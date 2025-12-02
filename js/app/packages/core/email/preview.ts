import {
  type ApiPaginatedThreadCursor,
  previewsInboxCursor,
} from '@service-email/client';
import { createSingletonRoot } from '@solid-primitives/rootless';
import type { Accessor } from 'solid-js';
import { createMemo, createResource } from 'solid-js';

export type EmailPreview = ApiPaginatedThreadCursor['items'][number];

async function getPreviews() {
  const { data, error } = await previewsInboxCursor({
    path: { view: 'all' },
    query: { limit: 100, sort_method: 'updated_at' },
  });

  if (error) {
    console.error('Failed to fetch email previews:', error);
    return undefined;
  }

  return data;
}

const emailsResource = createSingletonRoot(() => createResource(getPreviews));

export function usePreviewEmails(): Accessor<EmailPreview[]> {
  const [r] = emailsResource();
  return createMemo(() => {
    const result = r.latest;
    if (!result) return [];
    return result.items;
  });
}
