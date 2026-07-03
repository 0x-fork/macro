import {
  defineBlock,
  type ExtractLoadType,
  LoadErrors,
  loadResult,
} from '@core/block';
import { ENABLE_MARKDOWN_LIVE_COLLABORATION } from '@core/constant/featureFlags';
import { queryClient } from '@queries/client';
import { waitForDocumentSyncServiceReady } from '@queries/storage/document-location';
import {
  type DocumentLoadBundle,
  readPersistedDocumentLoadBundle,
  seedDocumentLoadBundle,
} from '@queries/storage/documentLoad/documentLoadBundle';
import { documentLoadKeys } from '@queries/storage/documentLoad/keys';
import { storageServiceClient } from '@service-storage/client';
import type { AccessLevel } from '@service-storage/generated/schemas/accessLevel';
import type { DocumentMetadata } from '@service-storage/generated/schemas/documentMetadata';
import { makeFileFromBlob } from '@service-storage/util/makeFileFromBlob';
import { createSyncServiceSource } from '@service-sync/source';
import { err, ok } from 'neverthrow';
import MarkdownBlock from './component/Block';
import type { MarkdownRewriteOutput } from './signal/rewriteSignal';

export const definition = defineBlock({
  name: 'md',
  description: 'write markdown notes',
  defaultFilename: 'New Note',
  aliases: [
    { name: 'task', defaultFileName: 'New Task' },
    { name: 'snippet', defaultFileName: 'New Snippet' },
  ],
  component: MarkdownBlock,
  accepted: {
    md: 'text/markdown',
  },
  async load(source, intent) {
    if (source.type === 'sync-service') {
      const documentId = source.id;
      if (intent === 'preload') {
        return ok({
          type: 'preload',
          origin: source,
        });
      }

      const pre = queryClient.getQueryData<DocumentLoadBundle>(
        documentLoadKeys.bundle(documentId).queryKey
      );

      let token: string;
      let documentMetadata: DocumentMetadata;
      let userAccessLevel: AccessLevel;

      if (pre) {
        token = pre.token;
        documentMetadata = pre.documentMetadata;
        userAccessLevel = pre.userAccessLevel;
      } else {
        const [maybeDocument, maybeLocation, maybeToken] = await Promise.all([
          loadResult(storageServiceClient.getDocumentMetadata({ documentId })),
          loadResult(storageServiceClient.getDocumentLocation({ documentId })),
          storageServiceClient.permissionsTokens.createPermissionToken({
            document_id: documentId,
          }),
        ]);

        if (maybeDocument.isOk() && maybeLocation.isOk() && maybeToken.isOk()) {
          token = maybeToken.value.token;
          const documentResult = maybeDocument.value;
          documentMetadata = documentResult.documentMetadata;
          userAccessLevel = documentResult.userAccessLevel;

          let { data: location } = maybeLocation.value;
          if (
            location.type === 'presignedUrl' &&
            location.content.state === 'pending'
          ) {
            location = await waitForDocumentSyncServiceReady({
              documentId,
            }).catch((error) => {
              console.error(
                'Failed waiting for markdown sync-service location',
                error
              );
              return location;
            });
          }

          // Markdown initialization and lifecycle persistence are backend-owned.
          // If a markdown document still resolves to object storage here, opening
          // it would require a backend repair/backfill path rather than a frontend
          // sync-service mutation that leaves DB content metadata inconsistent.
          if (location.type !== 'syncServiceContent') {
            console.error(
              'Markdown document is not available in sync-service',
              documentId,
              location.content
            );
            return LoadErrors.INVALID;
          }

          // Cache the bundle so this document can still open when the
          // metadata/token fetches fail (e.g. offline); content then comes
          // from the locally persisted Loro snapshot.
          seedDocumentLoadBundle(documentId, {
            documentMetadata,
            userAccessLevel,
            token,
          });
        } else {
          // Fall back to the persisted bundle only when the server looked
          // unreachable, so a previously opened document still renders from
          // its local snapshot while offline. Authoritative rejections
          // (unauthorized, deleted, server error) must keep failing the
          // load — revoked access should not open from cache. The token
          // result is checked because it is the only unmapped result:
          // loadResult() collapses NETWORK_ERROR into INVALID. The blanked
          // persisted token is fine — the sync source fetches a fresh token
          // when it (re)connects.
          const serverUnreachable =
            maybeToken.isErr() &&
            maybeToken.error.some(
              ({ code }) => code === 'NETWORK_ERROR' || code === 'UNKNOWN_ERROR'
            );
          const persisted = serverUnreachable
            ? await readPersistedDocumentLoadBundle(documentId)
            : undefined;
          if (!persisted) {
            if (maybeToken.isErr()) return LoadErrors.UNAUTHORIZED;
            if (maybeDocument.isErr()) return err(maybeDocument.error);
            if (maybeLocation.isErr()) return err(maybeLocation.error);
            return LoadErrors.INVALID;
          }
          token = persisted.token;
          documentMetadata = persisted.documentMetadata;
          userAccessLevel = persisted.userAccessLevel;
        }
      }

      const { source: syncSource, doInitialSync } = createSyncServiceSource(
        source.id,
        token
      );

      // HACK: unfortunately, most blocks still rely on a dssFile for things like
      // metadata and fileName. so I'm creating an empty blob file to get around that.
      const fileWithoutBlob = await makeFileFromBlob({
        blob: new Blob([]),
        documentKeyParts: {
          owner: documentMetadata.owner,
          documentId: documentMetadata.documentId,
          documentVersionId: documentMetadata.documentVersionId.toString(),
          // @ts-ignore: TODO: fix / replace @macro-inc/document-processing-job-types
          fileType: 'md',
        },
        fileName: documentMetadata.documentName,
        mimeType: definition.accepted['md']!,
        // @ts-ignore: TODO: fix / replace @macro-inc/document-processing-job-types
        metadata: documentMetadata,
      });

      return ok({
        dssFile: fileWithoutBlob,
        userAccessLevel,
        syncSource,
        doInitialSync,
        documentMetadata,
      });
    }
    return LoadErrors.INVALID;
  },
  liveTrackingEnabled: true,
  syncServiceEnabled: ENABLE_MARKDOWN_LIVE_COLLABORATION,
  editPermissionEnabled: ENABLE_MARKDOWN_LIVE_COLLABORATION,
});

export type MarkdownData = ExtractLoadType<(typeof definition)['load']>;

export type MarkdownBlockSpec = {
  setPatches: (args: {
    patches: MarkdownRewriteOutput['diffs'];
  }) => Promise<void>;
  setIsRewriting: () => Promise<void>;
};
