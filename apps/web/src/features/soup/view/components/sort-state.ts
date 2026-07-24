import type { SystemSortOption } from '@app/features/next-soup/soup-view/sort-options';

export const nextHeaderSort = (
  current: { id: string; reversed: boolean } | undefined,
  id: SystemSortOption
) => ({
  id,
  reversed: current?.id === id ? !current.reversed : false,
});
