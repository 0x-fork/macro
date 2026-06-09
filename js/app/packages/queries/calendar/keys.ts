import { createQueryKeys } from '@lukemorales/query-key-factory';

export const calendarKeys = createQueryKeys('calendar', {
  all: null,
  range: (params: { startMs: number; endMs: number }) => ({
    queryKey: [params.startMs, params.endMs],
  }),
});
