import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { MenuItem } from '@core/component/ContextMenu';
import type { EntityData } from '@entity';
import NewSplitIcon from '@icon/wide-newSplit.svg';
import NoiseIcon from '@icon/wide-noise.svg';
import ArrowUpIcon from '@phosphor/arrow-up.svg';
import CheckIcon from '@phosphor/check.svg';
import CopyIcon from '@phosphor/copy.svg';
import FolderIcon from '@phosphor/folder-simple.svg';
import GitBranchIcon from '@phosphor/git-branch.svg';
import IdIcon from '@phosphor/identification-card.svg';
import LinkIcon from '@phosphor/link.svg';
import PencilIcon from '@phosphor/pencil.svg';
import ProhibitIcon from '@phosphor/prohibit.svg';
import ShareIcon from '@phosphor/share-network.svg';
import TrashIcon from '@phosphor/trash.svg';
import { For, Show, type Component, type JSX } from 'solid-js';
import type { SoupState } from '../create-soup-state';
import { createSoupEntityActions } from './create-soup-entity-actions';
import { useSoupView } from './soup-view-context';

interface SoupEntityActionsMenuProps {
  entities: EntityData[];
  soup: SoupState;
  onActionComplete?: () => void;
}

const ACTION_ICONS: Record<
  string,
  Component<JSX.SvgSVGAttributes<SVGSVGElement>>
> = {
  'mark-done': CheckIcon,
  'open-in-split': NewSplitIcon,
  rename: PencilIcon,
  'move-to-folder': FolderIcon,
  duplicate: CopyIcon,
  'copy-link': LinkIcon,
  'copy-branch-name': GitBranchIcon,
  'copy-entity-id': IdIcon,
  share: ShareIcon,
  'sender-signal': ArrowUpIcon,
  'sender-noise': NoiseIcon,
  'block-sender': ProhibitIcon,
  delete: TrashIcon,
};

export const SoupEntityActionsMenu = (props: SoupEntityActionsMenuProps) => {
  const panel = useSplitPanelOrThrow();
  const { activeTab } = useSoupView();
  const { buildActionGroups } = createSoupEntityActions();

  const groups = () =>
    buildActionGroups(props.soup, props.entities, {
      activeTab: activeTab(),
      activeListView: panel.handle.content().id,
    });

  const handleAction = async (onClick: () => void | Promise<void>) => {
    await onClick();
    props.onActionComplete?.();
  };

  return (
    <For each={groups()}>
      {(group, groupIndex) => (
        <>
          <Show when={groupIndex() > 0}>
            <Divider />
          </Show>
          <For each={group.items}>
            {(action) => (
              <MenuItem
                text={action.label}
                icon={ACTION_ICONS[action.id]}
                iconClass={
                  action.destructive
                    ? 'text-failure-ink/65 group-hover:text-failure-ink group-focus:text-failure-ink group-data-[highlighted]:text-failure-ink'
                    : 'text-ink/65 group-hover:text-ink group-focus:text-ink group-data-[highlighted]:text-ink'
                }
                onClick={() => handleAction(action.onClick)}
                class={
                  action.destructive
                    ? 'rounded-lg text-failure-ink/65 hover:text-failure-ink focus:text-failure-ink data-[highlighted]:text-failure-ink hover:bg-failure/10 focus:bg-failure/10 data-[highlighted]:bg-failure/10 hover:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-failure)_12%,transparent)] focus:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-failure)_12%,transparent)] data-[highlighted]:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-failure)_12%,transparent)]'
                    : 'rounded-lg'
                }
              />
            )}
          </For>
        </>
      )}
    </For>
  );
};

const Divider = () => <div class="my-0.5 h-px w-full bg-edge-muted" />;

