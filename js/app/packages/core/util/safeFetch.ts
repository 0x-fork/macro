import { err, ok, type Result } from 'neverthrow';
import { match } from 'ts-pattern';
import { platformFetch } from './platformFetch';
import type { ObjectLike, ResultError } from './result';
import { sleep } from './sleep';

/**
 * Base error codes for fetch operations.
 */
export type BaseFetchErrorCode =
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'SERVER_ERROR'
  | 'INVALID_JSON'
  | 'UNKNOWN_ERROR'
  | 'GONE';

/**
 * A function type for custom error response handling.
 *
 * @template CustomErrorCode - Additional custom error codes.
 *
 * @example
 * // Define custom error codes
 * type MyApiErrorCode = 'RATE_LIMITED' | 'INVALID_INPUT';
 *
 * // Create a custom error handler
 * const myErrorHandler: ErrorResponseHandler<MyApiErrorCode> = async (response) => {
 *   const data = await response.json();
 *   if (response.status === 429) {
 *     return {
 *       code: 'RATE_LIMITED',
 *       message: 'Too many requests, please try again later',
 *     };
 *   } else if (response.status === 400) {
 *     return {
 *       code: 'INVALID_INPUT',
 *       message: data.error || 'Invalid input provided',
 *     };
 *   }
 *   // Fall back to default error handling
 *   return {
 *     code: 'HTTP_ERROR',
 *     message: `HTTP error! status: ${response.status}`,
 *   };
 * };
 */
export type ErrorResponseHandler<CustomErrorCode extends string> = (
  response: Response
) => Promise<ResultError<BaseFetchErrorCode | CustomErrorCode>>;

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  maxTries?: number;
  /** number in seconds or expnential backoff */
  delay?: 'exponential' | number;
}

/**
 * Extended RequestInit interface that includes retry configuration.
 */
export interface SafeFetchInit extends RequestInit {
  retry?: RetryConfig;
}

export type TextResponse = { contentType: 'text/plain'; body: string };

/**
 * Performs a safe fetch operation with structured error handling and retry capability.
 *
 * @template T - The expected return type of the fetch operation.
 * @template CustomErrorCode - Additional custom error codes (optional).
 * @param {RequestInfo} input - The resource to fetch.
 * @param {SafeFetchInit} [init] - Custom settings to apply to the request, including retry configuration.
 * @param {ErrorResponseHandler<CustomErrorCode>} [errorResponseHandler] - Custom error response handler.
 * @returns {Promise<Result<T, ResultError<BaseFetchErrorCode | CustomErrorCode>[]>>} A promise that resolves to a Result.
 *
 * @example
 * // Basic usage
 * async function fetchUser(userId: string) {
 *   const result = await safeFetch<{ id: string, name: string }>(
 *     `https://localhost/users/${userId}`
 *   );
 *
 *   if ((result).isErr()) {
 *     console.error('Error fetching user:', result.error);
 *     return;
 *   }
 *
 *   const user = result.value;
 *   console.log('User data:', user);
 * }
 *
 * @example
 * // Usage with custom error handling
 * type MyApiErrorCode = 'RATE_LIMITED' | 'INVALID_INPUT';
 *
 * const myErrorHandler: ErrorResponseHandler<MyApiErrorCode> = async (response) => {
 *   // ... (implementation as shown in {@link ErrorResponseHandler} example)
 * };
 *
 * async function fetchUserWithCustomErrors(userId: string) {
 *   const result = await safeFetch<{ id: string, name: string }, MyApiErrorCode>(
 *     `https://localhost/users/${userId}`,
 *     undefined,
 *     myErrorHandler
 *   );
 *
 *   if ((result).isErr()) {
 *     const errors = result.error;
 *     switch (errors[0].code) {
 *       case 'RATE_LIMITED':
 *         console.error('Rate limit reached:', errors[0].message);
 *         // Implement retry logic or inform user
 *         break;
 *       case 'INVALID_INPUT':
 *         console.error('Invalid input:', errors[0].message);
 *         // Prompt user to correct input
 *         break;
 *       default:
 *         console.error('Error fetching user:', errors);
 *     }
 *     return;
 *   }
 *
 *   const user = result.value;
 *   console.log('User data:', user);
 * }
 *
 * @example
 * // Basic usage with retry
 * async function fetchUser(userId: string) {
 *   const result = await safeFetch<{ id: string, name: string }>(
 *     `https://localhost/users/${userId}`,
 *     {
 *       method: 'GET',
 *       retry: { maxTries: 3, delay: 'exponential' }
 *     }
 *   );
 *
 *   if ((result).isErr()) {
 *     console.error('Error fetching user:', result.error);
 *     return;
 *   }
 *
 *   const user = result.value;
 *   console.log('User data:', user);
 * }
 */
export async function safeFetch<
  T extends ObjectLike & (TextResponse | {}),
  CustomErrorCode extends string = never,
>(
  input: RequestInfo,
  init?: SafeFetchInit,
  errorResponseHandler?: ErrorResponseHandler<CustomErrorCode>
): Promise<Result<T, ResultError<BaseFetchErrorCode | CustomErrorCode>[]>> {
  const { retry, ...fetchInit } = init || {};
  const maxTries = retry?.maxTries ?? 1;
  const delay = retry?.delay ?? 0;
  type ErrorCode = BaseFetchErrorCode | CustomErrorCode;
  const fetchErr = (errors: ResultError<ErrorCode>[]) =>
    err<T, ResultError<ErrorCode>[]>(errors);
  let lastError: Result<T, ResultError<ErrorCode>[]> | undefined;

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      const response = await platformFetch(input, {
        ...fetchInit,
        headers: {
          ...(fetchInit?.method !== 'GET' &&
            fetchInit?.method !== 'HEAD' &&
            !(fetchInit?.body instanceof FormData) && {
              'Content-Type':
                (fetchInit?.headers as Record<string, string> | undefined)?.[
                  'Content-Type'
                ] ?? 'application/json',
            }),
          ...fetchInit?.headers,
        } as Record<string, string>,
      });

      if (!response.ok) {
        if (errorResponseHandler) {
          const customError = await errorResponseHandler(response);
          return fetchErr(customError ? [customError] : []);
        }

        const statusResult = match(response.status)
          .with(404, () => ({
            kind: 'return' as const,
            value: fetchErr([
              { code: 'NOT_FOUND' as const, message: 'Resource not found' },
            ]),
          }))
          .with(401, () => ({
            kind: 'return' as const,
            value: fetchErr([
              {
                code: 'UNAUTHORIZED' as const,
                message: 'Unauthorized access',
              },
            ]),
          }))
          .with(403, () => ({
            kind: 'return' as const,
            value: fetchErr([
              { code: 'FORBIDDEN' as const, message: 'Forbidden' },
            ]),
          }))
          .with(409, () => ({
            kind: 'return' as const,
            value: fetchErr([
              { code: 'CONFLICT' as const, message: 'Resource conflict' },
            ]),
          }))
          .with(410, () => ({
            kind: 'return' as const,
            value: fetchErr([
              { code: 'GONE' as const, message: 'Resource deleted' },
            ]),
          }))
          .with(500, () => ({
            kind: 'continue' as const,
            lastError: fetchErr([
              {
                code: 'SERVER_ERROR' as const,
                message: 'Internal server error',
              },
            ]),
          }))
          .otherwise(() => ({
            kind: 'return' as const,
            value: fetchErr([
              {
                code: 'HTTP_ERROR' as const,
                message: `HTTP error! status: ${response.status}`,
              },
            ]),
          }));
        if (statusResult.kind === 'return') {
          return statusResult.value;
        }
        lastError = statusResult.lastError;
      } else {
        if (fetchInit.method === 'HEAD') return ok({} as T);

        const contentType = response.headers.get('Content-Type');
        if (!contentType) return ok({} as T);

        if (contentType.includes('text/plain')) {
          const text = await response.text();
          return ok({ contentType, body: text } as T);
        }

        const data = await response.json();
        return ok(data as T);
      }
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        lastError = fetchErr([
          { code: 'NETWORK_ERROR', message: 'Network error occurred' },
        ]);
      } else if (error instanceof SyntaxError) {
        return fetchErr([
          { code: 'INVALID_JSON', message: 'Invalid JSON in response' },
        ]);
      } else {
        return fetchErr([
          {
            code: 'UNKNOWN_ERROR',
            message: `An unknown error occurred: ${error}`,
          },
        ]);
      }
    }

    if (attempt < maxTries) {
      await sleep(calculateDelay(delay, attempt));
    }
  }

  return (
    lastError ??
    fetchErr([
      {
        code: 'UNKNOWN_ERROR',
        message: 'Retry failed for an unknown reason',
      },
    ])
  );
}
function calculateDelay(
  delay: 'exponential' | number,
  attempt: number
): number {
  if (typeof delay === 'number') {
    return delay;
  }
  return Math.pow(2, attempt - 1) * 500; // Exponential backoff in milliseconds
}
