import { usePreference } from '@app/preferences/use-preference';
import { TabsInset } from '@core/component/TabsInset';
import RowsIcon from '@phosphor/rows.svg';
import TreeViewIcon from '@phosphor/tree-view.svg';

/** How a folder hierarchy surface renders: flat list or tree. */
export type FoldersViewMode = 'list' | 'tree';

/**
 * The sticky cross-session preference behind every List/Tree toggle.
 * Surfaces that show the toggle in different component trees (soup views,
 * the project block) each create their own instance with this shared key;
 * the value is read on mount, so simultaneously visible instances don't
 * live-sync — same trade-off as the soup sort preferences.
 */
export const useFolderViewModePreference = () =>
  usePreference<FoldersViewMode>('macro:pref:soup:folders:view-mode', {
    default: 'list',
  });

/** Segmented List/Tree control used in folder-surface top bars. */
export const FolderViewModeToggle = (props: {
  value: FoldersViewMode;
  onChange: (mode: FoldersViewMode) => void;
}) => {
  return (
    <TabsInset
      depth={2}
      list={[
        {
          value: 'list',
          label: (
            <span class="flex items-center gap-1">
              <RowsIcon class="size-3.5" />
              List
            </span>
          ),
        },
        {
          value: 'tree',
          label: (
            <span class="flex items-center gap-1">
              <TreeViewIcon class="size-3.5" />
              Tree
            </span>
          ),
        },
      ]}
      value={props.value}
      onChange={(value) => props.onChange(value as FoldersViewMode)}
    />
  );
};
