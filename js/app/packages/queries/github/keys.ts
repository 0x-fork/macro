import { createQueryKeys } from '@lukemorales/query-key-factory';

export const githubKeys = createQueryKeys('github', {
  pullRequests: null,
  pullRequest: (pullRequestId: string) => ({
    queryKey: [pullRequestId],
  }),
});
