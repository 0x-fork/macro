import { throwOnErr } from '@core/util/maybeResult';
import { authServiceClient } from '@service-auth/client';
import type { PatchUserOnboardingRequest } from '@service-auth/generated/schemas/patchUserOnboardingRequest';
import { useMutation } from '@tanstack/solid-query';
import { type MutationCallbacks, withCallbacks } from '../utils';
import { queryClient } from '../client';
import { authKeys } from './keys';

type CompleteOnboardingCallbacks = MutationCallbacks<
  void,
  Error,
  PatchUserOnboardingRequest
>;

type SetGroupCallbacks = MutationCallbacks<void, Error, { group: string }>;
