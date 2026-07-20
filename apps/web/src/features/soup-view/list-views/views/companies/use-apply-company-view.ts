import { useSoupCollection } from '@app/features/soup-list';
import { toast } from '@core/component/Toast/Toast';
import { useSoupView } from '../../../context';
import {
  applyCompanyView,
  isSoupCompanyViewConfig,
} from './company-view-config';

/** Apply production or replacement CRM saved-view formats to the collection. */
export function useApplyCompanyView() {
  const collection = useSoupCollection();
  const view = useSoupView();

  return (config: unknown): boolean => {
    if (!isSoupCompanyViewConfig(config)) {
      toast.failure("This view couldn't be loaded");
      return false;
    }

    applyCompanyView(collection, view, config, {
      allowedTab: (requested) =>
        requested && view.isTabAvailable(requested)
          ? requested
          : (view.defaultTab() ?? 'active'),
    });
    return true;
  };
}
