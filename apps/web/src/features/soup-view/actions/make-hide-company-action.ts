import { restoreSoupFocus } from '@app/features/next-soup/utils';
import { useMaybePreviewPanel } from '@components/app/PreviewPanel';
import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import {
  findAdjacentEntityItem,
  type SoupActionListState,
} from './list-action-state';

type MakeHideCompanyOptions = {
  // Available to all team members; the backend enforces
  // EditAccessLevel on PUT /crm/companies/{id}/hidden.
  setHidden: (companyId: string, hidden: boolean) => Promise<unknown>;
};

export const makeHideCompanyAction = (options: MakeHideCompanyOptions) => {
  const { setHidden } = options;

  const canExecute = (entity: EntityData): boolean =>
    entity.type === 'crm_company';

  const previewPanel = useMaybePreviewPanel();

  const executeWithList = async (
    entities: EntityData[],
    list: SoupActionListState
  ) => {
    const entity = entities[0];
    if (entity?.type !== 'crm_company') return;

    // The row leaves (Hide) or joins (Unhide) the active list once the
    // collection refetches, so move focus to a neighbour first.
    const nextItem = findAdjacentEntityItem(list, new Set([entity.id]));
    const inPreview = previewPanel !== undefined;

    const hidden = entity.hidden;

    list.selection.clear();
    if (nextItem) list.focus.set(nextItem.id);

    try {
      await setHidden(entity.id, !hidden);
      toast.success(hidden ? 'Unhidden' : 'Hidden');
    } catch {
      toast.failure(hidden ? 'Failed to unhide' : 'Failed to hide');
    }

    await restoreSoupFocus(nextItem?.entity.id, inPreview);
  };

  return { canExecute, executeWithList };
};
