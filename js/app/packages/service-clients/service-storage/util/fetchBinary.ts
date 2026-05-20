import type { ResultError } from '@core/util/result';

import { platformFetch } from 'core/util/platformFetch';
import { err, ok, type Result } from 'neverthrow';
import { match } from 'ts-pattern';
import type { DocumentMetadata } from '../generated/schemas/documentMetadata';
import type { StorageError } from './storageError';

export async function fetchBinary(
  url: string,
  responseType: 'arraybuffer',
  init?: RequestInit
): Promise<Result<ArrayBuffer, ResultError<StorageError>[]>>;
export async function fetchBinary(
  url: string,
  responseType: 'blob',
  init?: RequestInit
): Promise<Result<Blob, ResultError<StorageError>[]>>;
export async function fetchBinary<T extends ArrayBuffer | Blob>(
  url: string,
  responseType: 'arraybuffer' | 'blob',
  init?: RequestInit
): Promise<Result<T, ResultError<StorageError>[]>> {
  try {
    const response = await platformFetch(url, init);

    if (!response.ok) {
      return match(response.status)
        .with(404, () =>
          err<T, ResultError<StorageError>[]>([
            { code: 'NOT_FOUND', message: 'Resource not found' },
          ])
        )
        .with(401, () =>
          err<T, ResultError<StorageError>[]>([
            { code: 'UNAUTHORIZED', message: 'Unauthorized access' },
          ])
        )
        .with(500, () =>
          err<T, ResultError<StorageError>[]>([
            { code: 'SERVER_ERROR', message: 'Internal server error' },
          ])
        )
        .otherwise(() =>
          err<T, ResultError<StorageError>[]>([
            {
              code: 'HTTP_ERROR',
              message: `HTTP error! status: ${response.status}`,
            },
          ])
        );
    }

    const data = await (responseType === 'arraybuffer'
      ? response.arrayBuffer()
      : response.blob());
    return ok(data as T);
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      return err([
        { code: 'NETWORK_ERROR', message: 'Network error occurred' },
      ]);
    } else {
      return err([
        {
          code: 'UNKNOWN_ERROR',
          message: `An unknown error occurred: ${error}`,
        },
      ]);
    }
  }
}

export type BinaryFile = {
  blob: Blob;
  metadata: DocumentMetadata;
};
