import { staticFileIdEndpoint } from '@core/constant/servers';
import type { FetchError } from '@core/service';
import type { ResultError } from '@core/util/result';
import { $isImageNode } from '@lexical-core/nodes/ImageNode';
import type { MediaType } from '@lexical-core/nodes/MediaNode';
import { $isVideoNode } from '@lexical-core/nodes/VideoNode';
import { fetchBinaryDocumentData } from '@queries/storage/binary-document';
import {
  $getNodeByKey,
  createCommand,
  type LexicalCommand,
  type NodeKey,
} from 'lexical';
import { ok, type Result } from 'neverthrow';

// Commands (and small helpers) shared between plugins and decorator
// components. Decorators are registered at boot via initializeLexical(), so
// anything they import loads with the initial bundle — this module must stay
// free of heavy imports (plugin trees, editor registration code, viewers).
// The owning plugins re-export these for their other consumers.

export const UPDATE_DOCUMENT_NAME_COMMAND: LexicalCommand<
  Record<string, string>
> = createCommand('UPDATE_DOCUMENT_NAME_COMMAND');

export const TRY_UPDATE_EQUATION_COMMAND: LexicalCommand<string> =
  createCommand('TRY_UPDATE_EQUATION_COMMAND');

export const UPLOAD_MEDIA_SUCCESS_COMMAND: LexicalCommand<
  [NodeKey, string, MediaType]
> = createCommand('UPLOAD_MEDIA_SUCCESS_COMMAND');

export const UPLOAD_MEDIA_FAILURE_COMMAND: LexicalCommand<
  [NodeKey, MediaType]
> = createCommand('UPLOAD_MEDIA_FAILURE_COMMAND');

export const UPLOAD_MEDIA_START_COMMAND: LexicalCommand<[NodeKey, MediaType]> =
  createCommand('UPLOAD_MEDIA_START_COMMAND');

export const ON_MEDIA_COMPONENT_MOUNT_COMMAND: LexicalCommand<
  [NodeKey, MediaType]
> = createCommand('ON_MEDIA_COMPONENT_MOUNT_COMMAND');

export const UPDATE_MEDIA_SIZE_COMMAND: LexicalCommand<
  [NodeKey, { width: number; height: number }, MediaType]
> = createCommand('UPDATE_MEDIA_SIZE_COMMAND');

/**
 * Get the URL for media based on its source type.
 */
export async function getMediaUrl(src: {
  type: string;
  id: string;
  url: string;
}): Promise<Result<string, ResultError<FetchError | 'INVALID_DOCUMENT'>[]>> {
  if (src.type === 'local' || src.type === 'url') return ok(src.url);
  if (src.type === 'sfs') {
    const url = staticFileIdEndpoint(src.id);
    return ok(url);
  }
  if (src.type === 'dss') {
    return (await fetchBinaryDocumentData(src.id)).map((res) => res.blobUrl);
  }
  console.warn('Get media url failed for src:', src);
  return ok('');
}

/**
 * Upgrade DSS media URL after document checks.
 */
export function $upgradeDSSMediaUrl(
  key: NodeKey,
  url: string,
  mediaType: MediaType
) {
  const node = $getNodeByKey(key);
  if (!node) return;

  if (mediaType === 'image' && $isImageNode(node)) {
    node.setUrl(url, false);
  } else if (mediaType === 'video' && $isVideoNode(node)) {
    node.setUrl(url, false);
  }
}
