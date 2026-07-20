import { CommandState } from '@app/features/command/state';
import { EntitySelectionToolbarModal } from '@app/features/entity/EntitySelectionToolbarModal';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import type { EntityData } from '@entity';

export function SoupSelectionToolbar(props: {
  selected: readonly EntityData[];
  onClose: VoidFunction;
  onClear: VoidFunction;
}) {
  const analytics = useAnalytics();

  return (
    <EntitySelectionToolbarModal
      multiSelectEntities={[...props.selected]}
      onClose={props.onClose}
      onAction={() => {
        if (props.selected.length === 0) return;

        analytics.track('command_menu_open', {
          from: 'soup_view_selection_toolbar',
        });
        CommandState.openForEntityAction([...props.selected]);
      }}
    />
  );
}
