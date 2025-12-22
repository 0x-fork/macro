import type { CombinedRecipientItem } from '@core/user';
import { clamp } from '@core/util/math';
import { Combobox, type ComboboxTriggerMode } from '@kobalte/core/combobox';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
} from 'solid-js';
import { VList } from 'virtua/solid';
import {
  getRecipientOptionEmail,
  getRecipientOptionLabel,
  getRecipientOptionTextValue,
  getRecipientOptionValue,
  RecipientComboboxItem,
} from './RecipientSelector';

export type RecipientTypeaheadHandle = {
  /** Programmatically move highlight down (enters menu selection mode). */
  arrowDown: () => void;
  /** Programmatically move highlight up. */
  arrowUp: () => void;
  /** Returns the currently highlighted option, if any. */
  getHighlighted: () => CombinedRecipientItem | null;
};

type RecipientTypeaheadProps = {
  /** Full option pool (users + contacts; optionally channels/custom). */
  options: Accessor<CombinedRecipientItem[]>;
  /** Current external query string (what the user typed in the unified search input). */
  query: Accessor<string>;
  /** Control whether the dropdown is open. */
  open: Accessor<boolean>;
  /** Called when a suggestion is selected (click or Enter while highlighted). */
  onSelectEmail: (email: string, option: CombinedRecipientItem) => void;
  /** Forward a handle to drive arrow navigation + selection from an external input. */
  handleRef?: (h: RecipientTypeaheadHandle) => void;
  /** Optional: tweak trigger mode; default is manual because input is external. */
  triggerMode?: ComboboxTriggerMode;
  /** Optional: additional class for menu content. */
  contentClass?: string;
};

export function RecipientTypeahead(
  props: RecipientTypeaheadProps
): JSX.Element {
  let hiddenInputRef: HTMLInputElement | undefined;
  const [listboxRef, setListboxRef] = createSignal<HTMLElement | undefined>();

  // Maintain a stable filtered list driven by the external query.
  // Kobalte filters based on inputValue; we keep that in sync by writing to a hidden input.
  const filteredOptions = createMemo(() => {
    const q = props.query().trim().toLowerCase();
    if (!q) return [];
    return props
      .options()
      .filter((opt) => {
        const text = getRecipientOptionTextValue(opt).toLowerCase();
        return text.includes(q);
      })
      .slice(0, 20);
  });

  // Track highlighted option by observing Kobalte's highlighted DOM attribute.
  const getHighlighted = (): CombinedRecipientItem | null => {
    const el = listboxRef()?.querySelector('[data-highlighted]') as
      | HTMLElement
      | undefined;
    const value = el?.getAttribute('data-recipient-option-value');
    if (!value) return null;
    const opt = filteredOptions().find(
      (o) => getRecipientOptionValue(o) === value
    );
    return opt ?? null;
  };

  const dispatchListboxKey = (key: 'ArrowDown' | 'ArrowUp' | 'Enter') => {
    // Must bubble so Kobalte processes the event.
    listboxRef()?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key })
    );
  };

  // Expose handle to parent
  const handle: RecipientTypeaheadHandle = {
    arrowDown: () => dispatchListboxKey('ArrowDown'),
    arrowUp: () => dispatchListboxKey('ArrowUp'),
    getHighlighted,
  };
  props.handleRef?.(handle);

  // Keep hidden input value in sync so Kobalte internal state stays aligned.
  createEffect(() => {
    const q = props.query();
    if (!hiddenInputRef) return;
    if (hiddenInputRef.value === q) return;
    hiddenInputRef.value = q;
    hiddenInputRef.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });

  return (
    <Combobox<CombinedRecipientItem>
      multiple={false}
      virtualized
      triggerMode={props.triggerMode ?? 'manual'}
      closeOnSelection={true}
      open={props.open()}
      onOpenChange={() => {}}
      options={filteredOptions()}
      optionLabel={getRecipientOptionLabel}
      optionValue={getRecipientOptionValue}
      optionTextValue={getRecipientOptionTextValue}
      shouldFocusWrap
      class="w-full"
      value={undefined as any}
      onChange={(opt) => {
        // This fires when user clicks or presses Enter on a highlighted item.
        if (!opt) return;
        const email = getRecipientOptionEmail(opt);
        if (!email) return;
        props.onSelectEmail(email, opt);
      }}
    >
      <Combobox.Control<CombinedRecipientItem>>
        {() => {
          return (
            <Combobox.Input
              ref={(el) => {
                hiddenInputRef = el;
              }}
              class="sr-only"
            />
          );
        }}
      </Combobox.Control>

      <Combobox.Portal>
        <Combobox.Content
          class={`z-modal-content bg-menu border translate-y-1 border-edge p-1 ${props.contentClass ?? ''}`}
          onPointerDown={(e) => {
            // Keep the external unified-search input focused; otherwise `onBlur` can close the menu
            // before click selection runs.
            e.preventDefault();
          }}
        >
          <Combobox.Listbox
            ref={setListboxRef}
            class="flex flex-col gap-1"
            autoFocus="first"
          >
            {(items) => {
              const arr = Array.from(items());
              const count = arr.length;
              const height = clamp(count, 0, 6) * 36;

              return (
                <VList
                  data={arr}
                  style={{
                    height: `${height}px`,
                  }}
                >
                  {(item) => {
                    return <RecipientComboboxItem {...item} />;
                  }}
                </VList>
              );
            }}
          </Combobox.Listbox>
        </Combobox.Content>
      </Combobox.Portal>
    </Combobox>
  );
}
