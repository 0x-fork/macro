import {
  resetCommandCategoryIndex,
  searchCategories,
  setCommandCategoryIndex,
  setKonsoleContextInformation,
} from '@app/component/command/KonsoleItem';
import {
  resetKonsoleMode,
  setKonsoleMode,
  toggleKonsoleVisibility,
} from '@app/component/command/state';
import { EntitySelectionToolbarModal } from '@app/component/EntitySelectionToolbarModal';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { Show } from 'solid-js';

export const SoupEntitySelectionToolbar = () => {
  const { soup } = useSoupView();
  return (
    <Show when={soup.selection.count()}>
      <EntitySelectionToolbarModal
        multiSelectEntities={soup.selection.selected()}
        onClose={soup.selection.clear}
        onAction={() => {
          const selected = soup.selection.selected();
          const hasSelection = selected.length > 0;
          if (!hasSelection) {
            searchCategories.hideCategory('Selection');
            resetCommandCategoryIndex();
            resetKonsoleMode();
            return;
          }

          setKonsoleMode('SELECTION_MODIFICATION');
          const selectionIndex = searchCategories.getCategoryIndex('Selection');

          if (selectionIndex === undefined) return false;

          setCommandCategoryIndex(selectionIndex);

          searchCategories.showCategory('Selection');

          setKonsoleContextInformation({
            selectedEntities: selected.slice(),
            clearSelection: soup.selection.clear,
          });

          toggleKonsoleVisibility();
        }}
      />
    </Show>
  );
};
