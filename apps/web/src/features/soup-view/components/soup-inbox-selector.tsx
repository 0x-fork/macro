import { openAddInboxDialog } from '@app/features/inbox/AddInboxDialog';
import { SearchableMultiSelect } from '@app/features/next-soup/soup-view/filters-bar/searchable-multi-select';
import { useSoupView } from '@app/features/soup-view/context';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { inboxIconProps } from '@core/component/inboxIcon';
import { UserIcon } from '@core/component/UserIcon';
import { ENABLE_MULTI_INBOX_OVERRIDE } from '@core/constant/featureFlags';
import { useSettingsState } from '@core/constant/SettingsState';
import { Combobox } from '@kobalte/core/combobox';
import CaretDownIcon from '@phosphor/caret-down.svg';
import PlusIcon from '@phosphor/plus.svg';
import TrayIcon from '@phosphor/tray.svg';
import { useEmailLinksQuery } from '@queries/email/link';
import { Button, cn } from '@ui';
import { createMemo, Show } from 'solid-js';
import {
  encodeInboxSelection,
  inboxActiveIds,
  isNoInboxesSelection,
  selectOnlyInbox,
} from '../filters/inbox-selection';

export function SoupInboxSelector(props: { compact?: boolean }) {
  const { collection } = useSoupView();
  const linksQuery = useEmailLinksQuery();
  const multiInboxFlag = useFeatureFlag('enable-multi-inbox', {
    enabledOverride: ENABLE_MULTI_INBOX_OVERRIDE,
  });
  const { openSettings } = useSettingsState();

  const options = createMemo(() =>
    (linksQuery.data?.links ?? [])
      .map((link) => ({
        id: link.id,
        label: link.email_address,
        icon: () => (
          <UserIcon
            {...inboxIconProps(link.email_address)}
            photoUrl={link.photo_url ?? undefined}
            size="sm"
            suppressClick
            showTooltip={false}
          />
        ),
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  );

  const selectedIds = () => collection.facets.getSelected('email_inbox');
  const optionIds = () => options().map((option) => option.id);
  const explicitlyNone = () => isNoInboxesSelection(selectedIds());
  const activeIds = () => inboxActiveIds(selectedIds(), optionIds());

  const setSelected = (ids: string[]) => {
    collection.facets.set(
      'email_inbox',
      encodeInboxSelection(ids, optionIds())
    );
  };
  const selectOnly = (id: string) => {
    collection.facets.set(
      'email_inbox',
      selectOnlyInbox(id, selectedIds(), optionIds())
    );
  };

  const label = () => {
    if (explicitlyNone()) return 'No inboxes';
    const ids = activeIds();
    if (selectedIds().length === 0) return 'All inboxes';
    if (ids.length === 1) {
      return (
        options().find((option) => option.id === ids[0])?.label ?? '1 inbox'
      );
    }
    return `${ids.length} inboxes`;
  };

  const startAddInboxFlow = () => {
    openSettings('Connected');
    openAddInboxDialog();
  };

  const selector = () => (
    <SearchableMultiSelect
      options={options}
      activeIds={activeIds}
      onChange={setSelected}
      onOnly={selectOnly}
      placeholder="Search inboxes..."
      preserveOrder
      action={
        multiInboxFlag().enabled
          ? {
              label: 'Add inbox',
              icon: () => <PlusIcon class="size-4" />,
              onSelect: startAddInboxFlow,
            }
          : undefined
      }
    >
      <Combobox.Trigger
        as={Button}
        variant="base"
        size="sm"
        depth={2}
        aria-label={props.compact ? label() : undefined}
        class={cn('bg-surface gap-1', props.compact ? 'px-1' : 'max-w-50')}
      >
        <TrayIcon />
        <Show when={!props.compact}>
          <span class="truncate">{label()}</span>
        </Show>
        <CaretDownIcon class="size-3 shrink-0" />
      </Combobox.Trigger>
    </SearchableMultiSelect>
  );

  return (
    <Show when={multiInboxFlag().enabled || options().length > 1}>
      <Show
        when={multiInboxFlag().enabled && options().length === 1}
        fallback={selector()}
      >
        <Button
          variant="base"
          size="sm"
          depth={2}
          class={cn('bg-surface gap-1', props.compact && 'px-1')}
          aria-label={props.compact ? 'Connect another email' : undefined}
          tooltip={props.compact ? 'Connect another email' : undefined}
          onClick={startAddInboxFlow}
        >
          <TrayIcon />
          <Show when={!props.compact}>
            <span class="truncate">Connect another email</span>
          </Show>
        </Button>
      </Show>
    </Show>
  );
}
