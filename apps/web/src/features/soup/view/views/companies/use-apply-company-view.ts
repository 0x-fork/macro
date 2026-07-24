import { useSoupView } from '@app/features/soup/view/context';
import { toast } from '@core/component/Toast/Toast';

import {
  applyCompanyView,
  isSoupCompanyViewConfig,
} from './company-view-config';

/** Apply production or replacement CRM saved-view formats to the collection. */
export function useApplyCompanyView() {
  const {
    activePresetFacets,
    applyTabPreset,
    collection,
    defaultTab,
    isTabAvailable,
    setViewMode,
  } = useSoupView();

  return (config: unknown): boolean => {
    if (!isSoupCompanyViewConfig(config)) {
      toast.failure("This view couldn't be loaded");
      return false;
    }

    applyCompanyView(
      collection,
      { activePresetFacets, applyTabPreset, setViewMode },
      config,
      {
        allowedTab: (requested) =>
          requested && isTabAvailable(requested)
            ? requested
            : (defaultTab() ?? 'active'),
      }
    );
    return true;
  };
}
