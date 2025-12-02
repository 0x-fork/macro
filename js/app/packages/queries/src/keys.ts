import { mergeQueryKeys } from '@lukemorales/query-key-factory';
import { authKeys } from './auth/keys';
import { emailKeys } from './email/keys';

export const queryKeys = mergeQueryKeys(authKeys, emailKeys);
