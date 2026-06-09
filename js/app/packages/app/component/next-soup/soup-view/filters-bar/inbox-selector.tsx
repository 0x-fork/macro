import { Combobox } from '@kobalte/core/combobox';
import CaretDownIcon from '@phosphor/caret-down.svg';
import TrayIcon from '@phosphor/tray.svg';
import { Button } from '@ui';
import { Show } from 'solid-js';
import { useInboxFilter } from './search-filter-controls';
import { SearchableMultiSelect } from './searchable-multi-select';

/**
 * Scopes the list to a subset of the user's linked inboxes. Multi-select,
 * default = all (no clause). Hidden entirely for single-inbox users so they
 * see no change. Selection is held in soup-view's `inboxFilter` and compiled
 * into `Owner` email literals.
 */
export function InboxSelector() {
  const inbox = useInboxFilter();

  return (
    <Show when={inbox.hasMultiple()}>
      <SearchableMultiSelect
        options={inbox.options}
        activeIds={inbox.activeIds}
        onChange={inbox.setIds}
        placeholder="Search inboxes..."
        preserveOrder
      >
        <Combobox.Trigger
          as={Button}
          variant="base"
          size="sm"
          depth={2}
          class="bg-surface gap-1 max-w-50"
        >
          <TrayIcon />
          <span class="truncate">{inbox.label()}</span>
          <CaretDownIcon class="size-3 shrink-0" />
        </Combobox.Trigger>
      </SearchableMultiSelect>
    </Show>
  );
}
