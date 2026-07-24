import { useSoupView } from '@app/features/soup/view/context';
import {
  CRM_LIST_COLUMN_LABELS,
  type CrmListColumnId,
  useCrmDisplayOptions,
} from '@companies/crm/display-options';
import {
  buildCrmViewShareUrl,
  type CrmViewConfig,
  usePersonalCrmViews,
  useTeamCrmViews,
} from '@companies/crm/saved-views';
import { useCrmPermissions } from '@companies/crm/team-crm-config';
import { toast } from '@core/component/Toast/Toast';
import { useUserId } from '@core/context/user';
import FloppyDiskIcon from '@phosphor/floppy-disk.svg';
import LinkIcon from '@phosphor/link.svg';
import PushPinIcon from '@phosphor/push-pin.svg';
import SlidersIcon from '@phosphor/sliders-horizontal.svg';
import StackIcon from '@phosphor/stack.svg';
import TrashIcon from '@phosphor/trash.svg';
import { useIsTeamAdmin } from '@queries/team/teams';
import { Button, cn, Dropdown, SegmentedControl, Tooltip } from '@ui';
import { createSignal, For, type JSX, Show } from 'solid-js';

import {
  captureCompanyView,
  isSoupCompanyViewConfig,
  type SoupCompanyViewConfig,
} from './company-view-config';
import { useApplyCompanyView } from './use-apply-company-view';

const asSharedConfig = (config: SoupCompanyViewConfig): CrmViewConfig => config;

const copyShareLink = (config: SoupCompanyViewConfig) => {
  void navigator.clipboard
    .writeText(buildCrmViewShareUrl(asSharedConfig(config)))
    .then(() => toast.success('Link copied to clipboard'))
    .catch(() => toast.failure('Failed to copy link'));
};

const copySavedViewLink = (config: unknown) => {
  if (!isSoupCompanyViewConfig(config)) {
    toast.failure("This view couldn't be loaded");
    return;
  }
  copyShareLink(config);
};

function SavedViewRow(props: {
  name: string;
  isDefault?: boolean;
  onApply: () => void;
  onCopyLink: () => void;
  onSetDefault?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div class="group flex w-full items-center gap-0.5 rounded-lg pl-2 pr-1 hover:bg-ink/5">
      <button
        type="button"
        class="min-w-0 flex-1 truncate py-1.5 text-left text-sm"
        onClick={props.onApply}
      >
        {props.name}
      </button>
      <Show when={props.isDefault && !props.onSetDefault}>
        <PushPinIcon class="size-3.5 shrink-0 text-ink-muted" />
      </Show>
      <Show when={props.onSetDefault}>
        {(setDefault) => (
          <Tooltip
            label={props.isDefault ? 'Remove default' : 'Set as default'}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              label={props.isDefault ? 'Remove default' : 'Set as default'}
              class={cn(
                'size-6 shrink-0 text-ink-muted',
                !props.isDefault &&
                  'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
              )}
              onClick={() => setDefault()()}
            >
              <PushPinIcon class="size-3.5" />
            </Button>
          </Tooltip>
        )}
      </Show>
      <Tooltip label="Copy link">
        <Button
          variant="ghost"
          size="icon-sm"
          label="Copy link"
          class="size-6 shrink-0 text-ink-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={props.onCopyLink}
        >
          <LinkIcon class="size-3.5" />
        </Button>
      </Tooltip>
      <Show when={props.onDelete}>
        {(remove) => (
          <Tooltip label="Delete view">
            <Button
              variant="ghost"
              size="icon-sm"
              label="Delete view"
              class="size-6 shrink-0 text-ink-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => remove()()}
            >
              <TrashIcon class="size-3.5" />
            </Button>
          </Tooltip>
        )}
      </Show>
    </div>
  );
}

function EmptyViewsHint(props: { children: JSX.Element }) {
  return (
    <div class="px-2 py-1.5 text-xs text-ink-extra-muted">{props.children}</div>
  );
}

export function CompanyDisplayMenu() {
  const { applyTabPreset, collection, viewMode } = useSoupView();
  const display = useCrmDisplayOptions();
  const isTeamAdmin = useIsTeamAdmin();
  const listMode = () => viewMode() === 'list';
  const showingHidden = () => collection.state.activeTab === 'hidden';
  return (
    <Show when={listMode() || isTeamAdmin()}>
      <Dropdown>
        <Tooltip label="Display options">
          <Dropdown.Trigger
            depth={2}
            class="bg-surface"
            label="Display options"
          >
            <SlidersIcon />
          </Dropdown.Trigger>
        </Tooltip>
        <Dropdown.Content class="w-56 shadow-menu">
          <Show when={listMode()}>
            <Dropdown.Group>
              <Dropdown.GroupLabel>List columns</Dropdown.GroupLabel>
              <For
                each={Object.keys(CRM_LIST_COLUMN_LABELS) as CrmListColumnId[]}
              >
                {(column) => (
                  <Dropdown.CheckboxItem
                    checked={display.options().listColumns[column]}
                    onChange={() => display.toggleListColumn(column)}
                    closeOnSelect={false}
                  >
                    {CRM_LIST_COLUMN_LABELS[column]}
                  </Dropdown.CheckboxItem>
                )}
              </For>
            </Dropdown.Group>
          </Show>
          <Show when={isTeamAdmin()}>
            <Dropdown.Group>
              <Dropdown.CheckboxItem
                checked={showingHidden()}
                onChange={() =>
                  applyTabPreset(showingHidden() ? 'active' : 'hidden')
                }
                closeOnSelect={false}
              >
                Show hidden companies
              </Dropdown.CheckboxItem>
            </Dropdown.Group>
          </Show>
        </Dropdown.Content>
      </Dropdown>
    </Show>
  );
}

export function CompanyViewsMenu() {
  const { collection, viewMode } = useSoupView();
  const personal = usePersonalCrmViews();
  const team = useTeamCrmViews();
  const permissions = useCrmPermissions();
  const userId = useUserId();
  const [open, setOpen] = createSignal(false);
  const [formOpen, setFormOpen] = createSignal(false);
  const [name, setName] = createSignal('');
  const [scope, setScope] = createSignal<'personal' | 'team'>('personal');

  const current = () => captureCompanyView(collection, { viewMode });
  const applyCompanyView = useApplyCompanyView();
  const apply = (config: unknown) => {
    if (applyCompanyView(config)) setOpen(false);
  };
  const save = () => {
    const viewName = name().trim();
    if (!viewName) return;
    const config = current();
    if (scope() === 'team') {
      team.add(viewName, asSharedConfig(config));
    } else {
      personal.create.mutate({
        name: viewName,
        config: asSharedConfig(config),
      });
    }
    setName('');
    setFormOpen(false);
    setOpen(false);
    toast.success('View saved');
  };
  const canDeleteTeam = (createdBy: string | undefined) =>
    permissions.canEditCrm() ||
    (createdBy !== undefined && createdBy === userId());

  return (
    <Dropdown
      open={open()}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setName('');
          setFormOpen(false);
        }
      }}
    >
      <Dropdown.Trigger depth={2} class="bg-surface">
        <StackIcon />
        <span>Views</span>
      </Dropdown.Trigger>
      <Dropdown.Content class="w-64 shadow-menu">
        <Dropdown.Group>
          <Dropdown.GroupLabel>My views</Dropdown.GroupLabel>
          <For
            each={personal.views()}
            fallback={<EmptyViewsHint>No saved views</EmptyViewsHint>}
          >
            {(view) => (
              <SavedViewRow
                name={view.name}
                isDefault={view.config.isDefault === true}
                onApply={() => apply(view.config)}
                onCopyLink={() => copySavedViewLink(view.config)}
                onSetDefault={() =>
                  personal.setDefault.mutate({
                    id: view.config.isDefault ? undefined : view.id,
                  })
                }
                onDelete={() => personal.remove.mutate({ id: view.id })}
              />
            )}
          </For>
        </Dropdown.Group>
        <Dropdown.Group>
          <Dropdown.GroupLabel>Team views</Dropdown.GroupLabel>
          <For
            each={team.views()}
            fallback={<EmptyViewsHint>No team views</EmptyViewsHint>}
          >
            {(view) => (
              <SavedViewRow
                name={view.name}
                isDefault={view.id === team.defaultViewId()}
                onApply={() => apply(view.config)}
                onCopyLink={() => copySavedViewLink(view.config)}
                onSetDefault={
                  permissions.canEditCrm()
                    ? () =>
                        team.setDefault(
                          view.id === team.defaultViewId() ? undefined : view.id
                        )
                    : undefined
                }
                onDelete={
                  canDeleteTeam(view.createdBy)
                    ? () => team.remove(view.id)
                    : undefined
                }
              />
            )}
          </For>
        </Dropdown.Group>
        <Dropdown.Group>
          <Show
            when={formOpen()}
            fallback={
              <Dropdown.Item
                closeOnSelect={false}
                onSelect={() => setFormOpen(true)}
              >
                <FloppyDiskIcon class="size-3.5" />
                Save current view…
              </Dropdown.Item>
            }
          >
            <div class="flex flex-col gap-1.5 p-1.5">
              <input
                ref={(element) => requestAnimationFrame(() => element.focus())}
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') return;
                  event.stopPropagation();
                  if (event.key === 'Enter') save();
                }}
                placeholder="View name"
                class={cn(
                  'w-full rounded-md border border-edge-muted bg-transparent px-2 py-1 text-sm',
                  'outline-none focus:border-accent placeholder:text-ink-faint'
                )}
              />
              <div class="flex items-center justify-between gap-1.5">
                <SegmentedControl
                  size="sm"
                  aria-label="View visibility"
                  value={scope()}
                  onChange={setScope}
                  options={[
                    { value: 'personal', label: 'Personal' },
                    { value: 'team', label: 'Team' },
                  ]}
                />
                <Button
                  variant="base"
                  size="sm"
                  disabled={!name().trim()}
                  onClick={save}
                >
                  Save
                </Button>
              </div>
            </div>
          </Show>
          <Dropdown.Item
            closeOnSelect
            onSelect={() => copyShareLink(current())}
          >
            <LinkIcon class="size-3.5" />
            Copy link to current view
          </Dropdown.Item>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
}
