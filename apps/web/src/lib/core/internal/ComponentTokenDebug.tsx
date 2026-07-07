import {
  semanticV2,
  setSemanticV2,
  themeDepth,
} from '@theme/signals/themeSignals';
import {
  Button,
  type ButtonProps,
  Checkbox,
  cn,
  Panel,
  ToggleSwitch,
  Tooltip,
} from '@ui';
import { addCtrlJKMenuNavigation } from '@ui/utils/menuKeyboardNavigation';
import { MENU_CONTENT_CLASS } from '@core/component/ContextMenu';
import { DropdownMenu as KobalteDropdownMenu } from '@kobalte/core/dropdown-menu';
import { SegmentedControl as KSegmentedControl } from '@kobalte/core/segmented-control';
import { buildConfig } from '@core/component/LexicalMarkdown/builder/MarkdownConfigBuilder';
import { MarkdownShell } from '@core/component/LexicalMarkdown/builder/MarkdownShell';
import { Select } from '@kobalte/core/select';
import { Combobox } from '@kobalte/core/combobox';
import type { CollectionNode } from '@kobalte/core';
import CaretDownIcon from '@phosphor/caret-down.svg';
import CheckIcon from '@phosphor/check.svg';
import {
  type ComponentProps,
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  splitProps,
  type JSX,
} from 'solid-js';

/**
 * Debug page for the semantic-token migration (see index.css `@theme` +
 * `:root.semantic-v2`). Showcases the new tokens/utilities on real components and
 * includes a WCAG contrast checker. Swap `main.tsx`'s import to this to view it.
 *
 * NOTE: the new tokens' *migrated* values only apply under the `semantic-v2` class
 * on <html>. Use the toggle at the top to flip between flag-off (aliases) and
 * flag-on (migrated). Toggling also disables the Surface/Layer elevation logic,
 * exactly like the app flag.
 */

const LOREM_SHORT = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
const LOREM_MEDIUM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

// Surfaces: label, utility class (empty if none), backing var (for contrast probe).
const SURFACE_TOKENS = [
  { label: 'surface', cls: 'bg-surface', var: '--color-surface' },
  { label: 'panel', cls: '', var: '--color-panel' }, // flag-only, no utility (consumed via --surface-fill)
  { label: 'card', cls: 'bg-card', var: '--color-card' },
  { label: 'menu', cls: 'bg-menu', var: '--color-menu' },
  { label: 'modal', cls: 'bg-modal', var: '--color-modal' },
  { label: 'toast', cls: 'bg-toast', var: '--color-toast' },
] as const;

const CONTENT_TOKENS = [
  { name: 'text-content-primary', cls: 'text-content-primary' },
  { name: 'text-content-secondary', cls: 'text-content-secondary' },
  { name: 'text-content-tertiary', cls: 'text-content-tertiary' },
  { name: 'text-ink-disabled', cls: 'text-ink-disabled' },
  { name: 'text-ink-placeholder', cls: 'text-ink-placeholder' },
] as const;

const BORDER_TOKENS = [
  { name: 'border-edge-primary', cls: 'border-edge-primary' },
  { name: 'border-edge-secondary', cls: 'border-edge-secondary' },
  { name: 'border-edge-divider', cls: 'border-edge-divider' },
] as const;

const TOKEN_BUTTON_VARIANTS = [
  'primary',
  'secondary',
  'ghost',
  'destructive',
  'link',
  'cta',
] as const;

const TOKEN_BUTTON_SIZES = ['sm', 'md', 'lg'] as const;
const TOKEN_BUTTON_ICON_SIZES = ['icon-sm', 'icon-md', 'icon-lg'] as const;

const BUTTON_STATES = [
  { name: 'button-hover', cls: 'bg-button-hover' },
  { name: 'button-active', cls: 'bg-button-active' },
  { name: 'button-selected', cls: 'bg-button-selected' },
] as const;

const UI_BUTTON_VARIANTS = [
  'ghost',
  'base',
  'active',
  'danger',
  'cta',
] as const;

// ── WCAG contrast checker (ported) ──────────────────────────────────────────

type ContrastCell = { row: string; col: string; ratio: number; label: string };

function srgbToLinear(value: number) {
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function parseColorToLinearRgb(
  color: string
): [number, number, number] | undefined {
  const rgb = color.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1]
      .replace(/,/g, ' ')
      .split(/\s+/)
      .filter((part) => part !== '/' && part.length > 0)
      .slice(0, 3)
      .map((part) =>
        part.endsWith('%')
          ? Number.parseFloat(part) / 100
          : Number.parseFloat(part) / 255
      );
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      return [
        srgbToLinear(parts[0]),
        srgbToLinear(parts[1]),
        srgbToLinear(parts[2]),
      ];
    }
  }

  const srgb = color.match(/color\(srgb\s+([^)]*)\)/i);
  if (srgb) {
    const parts = srgb[1]
      .split(/\s+/)
      .filter((part) => part !== '/' && part.length > 0)
      .slice(0, 3)
      .map(Number.parseFloat);
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      return [
        srgbToLinear(parts[0]),
        srgbToLinear(parts[1]),
        srgbToLinear(parts[2]),
      ];
    }
  }

  const oklch = color.match(/oklch\(([^)]*)\)/i);
  if (oklch) {
    const parts = oklch[1]
      .replace(/,/g, ' ')
      .split(/\s+/)
      .filter((part) => part !== '/' && part.length > 0);
    const l = parts[0]?.endsWith('%')
      ? Number.parseFloat(parts[0]) / 100
      : Number.parseFloat(parts[0] ?? 'NaN');
    const c = Number.parseFloat(parts[1] ?? 'NaN');
    const h = Number.parseFloat((parts[2] ?? '0').replace('deg', ''));
    if ([l, c, h].every(Number.isFinite)) {
      const hr = (h * Math.PI) / 180;
      const a = c * Math.cos(hr);
      const b = c * Math.sin(hr);
      const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = l - 0.0894841775 * a - 1.291485548 * b;
      const l3 = l_ ** 3;
      const m3 = m_ ** 3;
      const s3 = s_ ** 3;
      return [
        4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
        -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
        -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
      ];
    }
  }

  return undefined;
}

function luminance(rgb: [number, number, number]) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrastRatio(foreground: string, background: string) {
  const fg = parseColorToLinearRgb(foreground);
  const bg = parseColorToLinearRgb(background);
  if (!fg || !bg) return undefined;
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastLabel(ratio: number) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'Large';
  return 'Fail';
}

function contrastDescription(label: string | undefined) {
  switch (label) {
    case 'AAA':
      return 'AAA: 7:1 or higher. Passes enhanced contrast for normal text.';
    case 'AA':
      return 'AA: 4.5:1 or higher. Passes standard contrast for normal text.';
    case 'Large':
      return 'Large text only: 3:1 or higher. Passes AA for large text, fails normal text.';
    case 'Fail':
      return 'Fail: below 3:1. Does not meet WCAG text contrast thresholds.';
    default:
      return 'Contrast ratio is still being calculated.';
  }
}

function readContrastMatrix(
  root: HTMLElement,
  textTokens: readonly (readonly [string, string])[],
  bgTokens: readonly (readonly [string, string])[]
): ContrastCell[] {
  return textTokens.flatMap(([rowLabel, textToken]) =>
    bgTokens.map(([colLabel, bgToken]) => {
      const el = document.createElement('div');
      el.style.color = `var(${textToken})`;
      el.style.backgroundColor = `var(${bgToken})`;
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.opacity = '0';
      root.append(el);
      const style = getComputedStyle(el);
      const ratio = contrastRatio(style.color, style.backgroundColor) ?? 0;
      el.remove();
      return {
        row: rowLabel,
        col: colLabel,
        ratio,
        label: contrastLabel(ratio),
      };
    })
  );
}

const A11Y_TEXT = [
  ['content-primary', '--color-content-primary'],
  ['content-secondary', '--color-content-secondary'],
  ['content-tertiary', '--color-content-tertiary'],
  ['ink-disabled', '--color-ink-disabled'],
  ['ink-placeholder', '--color-ink-placeholder'],
  ['content-link', '--color-content-link'],
] as const;

const A11Y_SURFACES = [
  ['surface', '--color-surface'],
  ['panel', '--color-panel'],
  ['card', '--color-card'],
  ['menu', '--color-menu'],
  ['toast', '--color-toast'],
] as const;

// "No on-* tokens" relies on the content ramp reading on neutral fills; accent is
// the quarantined exception, so it's tested separately here.
const A11Y_FILL_TEXT = [
  ['content-primary', '--color-content-primary'],
  ['content-secondary', '--color-content-secondary'],
  ['surface', '--color-surface'],
] as const;

const A11Y_FILLS = [
  ['button-primary', '--color-button-primary'],
  ['button-secondary', '--color-button-secondary'],
  ['accent', '--color-accent'],
] as const;

function ContrastBadge(props: { cell: ContrastCell | undefined }) {
  return (
    <Tooltip as="span" label={contrastDescription(props.cell?.label)}>
      <span
        class="rounded px-1.5 py-0.5 text-[10px] font-medium"
        classList={{
          'text-success bg-success-bg':
            props.cell?.label === 'AAA' || props.cell?.label === 'AA',
          'text-alert bg-alert-bg': props.cell?.label === 'Large',
          'text-failure bg-failure-bg': props.cell?.label === 'Fail',
        }}
      >
        {props.cell?.label ?? '—'}
      </span>
    </Tooltip>
  );
}

function ContrastTable(props: {
  cells: ContrastCell[];
  rows: readonly (readonly [string, string])[];
  cols: readonly (readonly [string, string])[];
  rowHeader: string;
}) {
  const find = (row: string, col: string) =>
    props.cells.find((c) => c.row === row && c.col === col);
  return (
    <div class="rounded-md overflow-x-auto ring-1 ring-edge-muted bg-surface">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th class="text-left p-3 text-xs text-ink-muted border-b border-edge-muted">
              {props.rowHeader}
            </th>
            <For each={props.cols}>
              {([col]) => (
                <th class="text-left p-3 text-xs text-ink-muted border-b border-edge-muted font-mono">
                  {col}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>
            {([rowLabel, textToken]) => (
              <tr>
                <td class="p-3 text-xs font-medium text-ink border-b border-edge-muted font-mono">
                  {rowLabel}
                </td>
                <For each={props.cols}>
                  {([colLabel, bgToken]) => {
                    const cell = () => find(rowLabel, colLabel);
                    return (
                      <td class="p-3 border-b border-edge-muted">
                        <div class="flex items-center gap-2">
                          <span
                            class="rounded-md px-2 py-1 text-base font-semibold ring-1 ring-edge-muted"
                            style={{
                              color: `var(${textToken})`,
                              'background-color': `var(${bgToken})`,
                            }}
                          >
                            Aa
                          </span>
                          <span class="text-xs text-ink-muted font-mono w-9">
                            {cell()?.ratio ? cell()!.ratio.toFixed(2) : '—'}
                          </span>
                          <ContrastBadge cell={cell()} />
                        </div>
                      </td>
                    );
                  }}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

function Section(props: {
  title: string;
  note?: string;
  children: JSX.Element;
}) {
  return (
    <section class="flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <h2 class="text-xl font-semibold text-ink">{props.title}</h2>
        {props.note && <p class="text-sm text-ink-muted">{props.note}</p>}
      </div>
      {props.children}
    </section>
  );
}

function Swatch(props: {
  label: string;
  sub?: string;
  class?: string;
  style?: JSX.CSSProperties;
}) {
  return (
    <div
      class={cn(
        'rounded-md p-4 min-h-24 flex flex-col justify-between ring-1 ring-edge-muted',
        props.class
      )}
      style={props.style}
    >
      <span class="text-sm font-medium text-ink">{props.label}</span>
      {props.sub && (
        <span class="text-[10px] text-ink-extra-muted font-mono break-all">
          {props.sub}
        </span>
      )}
    </div>
  );
}

function PlusIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

// A button built entirely on the new tokens (lives here for the debug page).
// Hover/active are translucent overlays painted on a `::before` layer so they
// composite over any fill; the label sits above the overlay via a relative span.
type TokenButtonVariant = (typeof TOKEN_BUTTON_VARIANTS)[number];
type TokenButtonSize = 'sm' | 'md' | 'lg' | 'icon-sm' | 'icon-md' | 'icon-lg';

const TOKEN_BUTTON_BASE =
  "relative inline-flex items-center justify-center font-medium rounded-md whitespace-nowrap select-none outline-none transition-colors disabled:opacity-30 disabled:cursor-not-allowed before:content-[''] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:transition-colors";

// Neutral fills + ghost use the ink-tinted overlay on hover/active; destructive
// and cta swap their own tints/fills; link is inline text.
const TOKEN_OVERLAY =
  'enabled:hover:before:bg-button-hover enabled:active:before:bg-button-active enabled:hover:text-content-primary';

const TOKEN_BUTTON_VARIANT_CLS: Record<TokenButtonVariant, string> = {
  primary: `bg-button-primary text-content-secondary ${TOKEN_OVERLAY}`,
  secondary:
    'bg-transparent text-content-secondary ring-1 ring-edge-secondary enabled:hover:bg-button-secondary enabled:active:before:bg-button-active',
  ghost: `bg-button-tertiary text-content-secondary enabled:hover:text-content-secondary ${TOKEN_OVERLAY}`,
  destructive:
    'bg-button-destructive text-content-destructive enabled:hover:bg-button-destructive-hover enabled:active:bg-button-destructive-active',
  link: 'bg-transparent text-content-link enabled:hover:text-content-link-hover underline underline-offset-2',
  cta: 'bg-accent text-surface enabled:hover:bg-accent/90 enabled:active:bg-accent/80',
};

const TOKEN_BUTTON_SIZE_CLS: Record<TokenButtonSize, string> = {
  sm: 'px-2 py-1 text-xs [&_:where(svg)]:size-3.5',
  md: 'px-3 py-1.5 text-sm [&_:where(svg)]:size-4',
  lg: 'px-4 py-2 text-base [&_:where(svg)]:size-5',
  'icon-sm': 'p-1.5 [&_:where(svg)]:size-4',
  'icon-md': 'p-2 [&_:where(svg)]:size-5',
  'icon-lg': 'p-2.5 [&_:where(svg)]:size-6',
};

function TokenButton(props: {
  variant?: TokenButtonVariant;
  size?: TokenButtonSize;
  disabled?: boolean;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      class={cn(
        TOKEN_BUTTON_BASE,
        TOKEN_BUTTON_VARIANT_CLS[props.variant ?? 'primary'],
        TOKEN_BUTTON_SIZE_CLS[props.size ?? 'md'],
        props.class
      )}
    >
      <span class="relative inline-flex items-center gap-1.5">
        {props.children}
      </span>
    </button>
  );
}

// A text field built on the new tokens (lives here for the debug page).
type TextFieldVariant = 'filled' | 'outline' | 'ghost';
type TextFieldSize = 'sm' | 'md' | 'lg';

const TEXTFIELD_VARIANTS = ['filled', 'outline', 'ghost'] as const;
const TEXTFIELD_SIZES = ['sm', 'md', 'lg'] as const;

const TEXTFIELD_BASE =
  'w-full rounded-md text-content-primary placeholder:text-ink-placeholder outline-none transition-[background-color,box-shadow] disabled:opacity-30 disabled:cursor-not-allowed';

const TEXTFIELD_VARIANT_CLS: Record<TextFieldVariant, string> = {
  filled:
    'bg-input enabled:hover:bg-input-hover focus-within:ring-2 focus-within:ring-edge-primary',
  outline:
    'bg-transparent ring-1 ring-edge-primary focus-within:ring-2 focus-within:ring-accent',
  ghost:
    'bg-transparent ring-1 ring-transparent enabled:hover:bg-input-hover focus-within:ring-2 focus-within:ring-edge-primary',
};

const TEXTFIELD_SIZE_CLS: Record<TextFieldSize, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-11 px-4 text-base',
};

function TokenTextField(props: {
  variant?: TextFieldVariant;
  size?: TextFieldSize;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      placeholder={props.placeholder ?? 'Type here…'}
      disabled={props.disabled}
      class={cn(
        TEXTFIELD_BASE,
        TEXTFIELD_VARIANT_CLS[props.variant ?? 'outline'],
        TEXTFIELD_SIZE_CLS[props.size ?? 'md']
      )}
    />
  );
}

// A single menu row for the always-open menu mocks below.
function MenuRow(props: {
  children: JSX.Element;
  selected?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  shortcut?: string;
}) {
  return (
    <div
      class={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-default select-none',
        props.disabled && 'text-ink-disabled',
        !props.disabled &&
          props.destructive &&
          'text-content-destructive hover:bg-button-destructive',
        !props.disabled &&
          !props.destructive &&
          'text-content-primary hover:bg-button-hover',
        props.selected && 'bg-button-selected'
      )}
    >
      {props.children}
      {props.shortcut && (
        <span class="ml-auto text-xs text-ink-placeholder">
          {props.shortcut}
        </span>
      )}
    </div>
  );
}

// Select / combobox built on Kobalte Select, styled with the tokens: trigger
// mimics the outline text field; content reuses the menu surface.
type SelectOption = { value: string; label: string };
const SELECT_OPTIONS: SelectOption[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'sent', label: 'Sent' },
  { value: 'archive', label: 'Archive' },
];

function TokenSelect() {
  const [value, setValue] = createSignal<SelectOption>(SELECT_OPTIONS[0]);
  return (
    <Select<SelectOption>
      options={SELECT_OPTIONS}
      value={value()}
      onChange={(opt) => opt && setValue(opt)}
      optionValue="value"
      optionTextValue="label"
      gutter={4}
      itemComponent={(itemProps: { item: CollectionNode<SelectOption> }) => (
        <Select.Item
          item={itemProps.item}
          class="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm text-content-primary outline-none cursor-default select-none data-highlighted:bg-button-hover data-selected:bg-button-selected"
        >
          <Select.ItemLabel>{itemProps.item.rawValue.label}</Select.ItemLabel>
          <Select.ItemIndicator>
            <CheckIcon class="size-3.5" />
          </Select.ItemIndicator>
        </Select.Item>
      )}
    >
      <Select.Trigger class="inline-flex items-center justify-between gap-2 w-48 rounded-md px-3 py-1.5 text-sm text-content-primary bg-transparent ring-1 ring-edge-primary outline-none focus:ring-2 focus:ring-accent data-expanded:ring-2 data-expanded:ring-accent">
        <Select.Value<SelectOption>>
          {(state) => state.selectedOption().label}
        </Select.Value>
        <CaretDownIcon class="size-3.5 text-content-tertiary shrink-0" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content class={cn(MENU_CONTENT_CLASS, 'min-w-48')}>
          <Select.Listbox class="w-full flex flex-col gap-0.5 outline-none" />
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}

// Combobox (filterable). Trigger control mimics the outline text field; the
// listbox reuses the menu surface. Shared bits:
const COMBO_CONTROL_CLS =
  'inline-flex items-center gap-2 w-56 rounded-md px-3 py-1.5 bg-transparent ring-1 ring-edge-primary focus-within:ring-2 focus-within:ring-accent';
const COMBO_INPUT_CLS =
  'flex-1 min-w-0 bg-transparent outline-none text-sm text-content-primary placeholder:text-ink-placeholder';
const COMBO_ITEM_CLS =
  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-content-primary outline-none cursor-default select-none data-highlighted:bg-button-hover data-selected:bg-button-selected';

const COMBO_PEOPLE: SelectOption[] = [
  { value: 'aria', label: 'Aria Montgomery' },
  { value: 'ben', label: 'Ben Carter' },
  { value: 'cai', label: 'Cai Nguyen' },
  { value: 'dev', label: 'Devon Ross' },
  { value: 'ess', label: 'Essie Park' },
  { value: 'fin', label: 'Finn OConnor' },
];

// Simple single-select combobox.
function SimpleCombobox() {
  const [value, setValue] = createSignal<SelectOption | null>(null);
  return (
    <Combobox<SelectOption>
      options={COMBO_PEOPLE}
      value={value()}
      onChange={setValue}
      optionValue="value"
      optionTextValue="label"
      optionLabel="label"
      placeholder="Assign a person…"
      itemComponent={(props: { item: CollectionNode<SelectOption> }) => (
        <Combobox.Item item={props.item} class={COMBO_ITEM_CLS}>
          <Combobox.ItemLabel class="flex-1 truncate">
            {props.item.rawValue.label}
          </Combobox.ItemLabel>
          <Combobox.ItemIndicator>
            <CheckIcon class="size-3.5" />
          </Combobox.ItemIndicator>
        </Combobox.Item>
      )}
    >
      <Combobox.Control class={COMBO_CONTROL_CLS}>
        <Combobox.Input class={COMBO_INPUT_CLS} />
        <Combobox.Trigger class="shrink-0 text-content-tertiary outline-none">
          <Combobox.Icon>
            <CaretDownIcon class="size-3.5" />
          </Combobox.Icon>
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.Portal>
        <Combobox.Content class={cn(MENU_CONTENT_CLASS, 'min-w-56')}>
          <Combobox.Listbox class="w-full flex flex-col gap-0.5 outline-none" />
        </Combobox.Content>
      </Combobox.Portal>
    </Combobox>
  );
}

type LabelOption = { value: string; label: string; dot: string };
const COMBO_LABELS: LabelOption[] = [
  { value: 'bug', label: 'Bug', dot: 'bg-failure' },
  { value: 'feature', label: 'Feature', dot: 'bg-success' },
  { value: 'design', label: 'Design', dot: 'bg-accent-90' },
  { value: 'research', label: 'Research', dot: 'bg-accent-210' },
  { value: 'urgent', label: 'Urgent', dot: 'bg-alert' },
  { value: 'backlog', label: 'Backlog', dot: 'bg-accent-270' },
];

// Complex combobox: colored option rows + a sticky action footer (create/manage)
// rendered alongside the listbox inside the menu surface.
function ActionCombobox() {
  const [value, setValue] = createSignal<LabelOption | null>(null);
  const [query, setQuery] = createSignal('');
  return (
    <Combobox<LabelOption>
      options={COMBO_LABELS}
      value={value()}
      onChange={setValue}
      onInputChange={setQuery}
      optionValue="value"
      optionTextValue="label"
      optionLabel="label"
      placeholder="Add or create a label…"
      itemComponent={(props: { item: CollectionNode<LabelOption> }) => (
        <Combobox.Item item={props.item} class={COMBO_ITEM_CLS}>
          <span
            class={cn(
              'size-2.5 rounded-full shrink-0',
              props.item.rawValue.dot
            )}
          />
          <Combobox.ItemLabel class="flex-1 truncate">
            {props.item.rawValue.label}
          </Combobox.ItemLabel>
          <Combobox.ItemIndicator>
            <CheckIcon class="size-3.5" />
          </Combobox.ItemIndicator>
        </Combobox.Item>
      )}
    >
      <Combobox.Control class={cn(COMBO_CONTROL_CLS, 'w-64')}>
        <Combobox.Input class={COMBO_INPUT_CLS} />
        <Combobox.Trigger class="shrink-0 text-content-tertiary outline-none">
          <Combobox.Icon>
            <CaretDownIcon class="size-3.5" />
          </Combobox.Icon>
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.Portal>
        <Combobox.Content class={cn(MENU_CONTENT_CLASS, 'min-w-64')}>
          <Combobox.Listbox class="w-full flex flex-col gap-0.5 outline-none max-h-48 overflow-y-auto" />
          <div class="w-full my-1 h-px bg-edge-divider" />
          <button
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-content-primary hover:bg-button-hover outline-none cursor-default"
          >
            <PlusIcon class="size-3.5" />
            <span class="truncate">
              Create{query().trim() ? ` “${query().trim()}”` : ' new label'}
            </span>
          </button>
          <button
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-content-secondary hover:bg-button-hover outline-none cursor-default"
          >
            Manage labels…
          </button>
        </Combobox.Content>
      </Combobox.Portal>
    </Combobox>
  );
}

// View-style inset tabs, reimplemented on Kobalte's segmented-control with the
// new tokens instead of Layer: a sunken `surface` track, and the checked tab is
// a raised `card` pill (reads as elevated once the flag is on).
const TAB_ITEMS = [
  { value: 'list', label: 'List' },
  { value: 'board', label: 'Board' },
  { value: 'calendar', label: 'Calendar' },
] as const;

function SegmentedDemo() {
  const [view, setView] = createSignal<string>('list');
  return (
    <KSegmentedControl
      value={view()}
      onChange={(v) => v && setView(v)}
      class="inline-flex items-center"
    >
      <div class="relative flex items-center gap-0.5 rounded-lg p-0.5 bg-surface ring-1 ring-edge-secondary">
        <For each={TAB_ITEMS}>
          {(item) => (
            <KSegmentedControl.Item value={item.value}>
              <KSegmentedControl.ItemInput class="absolute inset-0 pointer-events-none" />
              <KSegmentedControl.ItemLabel class="flex items-center px-2.5 py-1 text-xs font-medium rounded-md cursor-default select-none text-content-tertiary hover:text-content-primary data-checked:bg-card data-checked:text-content-primary data-checked:ring-1 data-checked:ring-edge-secondary data-checked:shadow-sm">
                {item.label}
              </KSegmentedControl.ItemLabel>
            </KSegmentedControl.Item>
          )}
        </For>
      </div>
    </KSegmentedControl>
  );
}

// Avatar reimplemented with tokens — accent-90 fill from the debug accent ramp.
type AvatarSize = 'sm' | 'md' | 'lg';
const AVATAR_SIZE_CLS: Record<AvatarSize, string> = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
};

function TokenAvatar(props: {
  size?: AvatarSize;
  children: JSX.Element;
  class?: string;
}) {
  return (
    <div
      class={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-accent-90 text-surface font-medium select-none',
        AVATAR_SIZE_CLS[props.size ?? 'md'],
        props.class
      )}
    >
      {props.children}
    </div>
  );
}

// Overlapping group; the ring matches the surface behind so overlaps read apart.
function TokenAvatarGroup(props: { children: JSX.Element }) {
  return (
    <div class="flex items-center [&>*]:ring-2 [&>*]:ring-card [&>*:not(:first-child)]:-ml-2">
      {props.children}
    </div>
  );
}

// Joined button group with tokenized shared edges.
function TokenButtonGroup(props: { items: string[] }) {
  return (
    <div class="inline-flex rounded-md overflow-hidden ring-1 ring-edge-secondary divide-x divide-edge-secondary">
      <For each={props.items}>
        {(label) => (
          <button
            type="button"
            class="px-3 py-1.5 text-sm font-medium text-content-primary bg-transparent enabled:hover:bg-button-hover enabled:active:bg-button-active outline-none"
          >
            {label}
          </button>
        )}
      </For>
    </div>
  );
}

// A markdown input using the same MarkdownShell primitive as ChannelInput, but
// styled like the token text field (fill + focus-within ring) instead of Surface.
function TokenMarkdownInput(props: {
  variant?: TextFieldVariant;
  placeholder?: string;
}) {
  const editor = buildConfig('markdown')
    .namespace(`token-debug-md-${props.variant ?? 'outline'}`)
    .withHistory();
  return (
    <div
      class={cn(
        'w-full rounded-md px-3 py-2 text-sm text-content-primary',
        TEXTFIELD_VARIANT_CLS[props.variant ?? 'outline']
      )}
    >
      <MarkdownShell
        config={editor}
        placeholder={props.placeholder ?? 'Write markdown… **bold**, _italic_'}
      />
    </div>
  );
}

// All TokenButton examples for one variant (text, disabled, icon+text, then
// icon-only across the icon sizes). `pill` renders the rounded-full column.
function ButtonSet(props: { variant: TokenButtonVariant; pill?: boolean }) {
  const cls = () => (props.pill ? 'rounded-full' : undefined);
  return (
    <div class="flex flex-wrap gap-3 items-center">
      <For each={TOKEN_BUTTON_SIZES}>
        {(size) => (
          <TokenButton variant={props.variant} size={size} class={cls()}>
            {size.toUpperCase()} button
          </TokenButton>
        )}
      </For>
      <TokenButton variant={props.variant} disabled class={cls()}>
        Disabled
      </TokenButton>
      <For each={TOKEN_BUTTON_SIZES}>
        {(size) => (
          <TokenButton variant={props.variant} size={size} class={cls()}>
            <PlusIcon />
            {size.toUpperCase()}
          </TokenButton>
        )}
      </For>
      <For each={TOKEN_BUTTON_ICON_SIZES}>
        {(size) => (
          <TokenButton variant={props.variant} size={size} class={cls()}>
            <PlusIcon />
          </TokenButton>
        )}
      </For>
    </div>
  );
}

// ── DropdownV2 — a copy of @ui Dropdown restyled onto the new tokens ─────────
// Content surface is `bg-menu` (no Surface/Layer), rows highlight with
// `bg-button-hover`, dividers use `bg-edge-divider`, edges use `ring-edge-primary`.
type DropdownPortalScope = 'local';
type PortalMount = ComponentProps<typeof KobalteDropdownMenu.Portal>['mount'];

const DD_ROW_CLASS =
  'group rounded-lg w-full flex items-center gap-1.5 p-1.5 px-2 text-left font-normal text-sm text-content-primary cursor-default outline-none hover:bg-button-hover data-highlighted:bg-button-hover data-disabled:opacity-50 data-disabled:cursor-not-allowed';
const DD_CONTENT_CLASS =
  'rounded-xl size-auto overflow-hidden z-action-menu menu-open-animation shadow-menu bg-menu ring-1 ring-edge-primary';
const DD_CHECKBOX_BOX_CLASS = cn(
  'inline-flex items-center justify-center size-3.5 shrink-0 rounded-sm',
  'border border-transparent text-surface',
  'group-hover:not-hover:border-edge-secondary group-data-highlighted:not-hover:border-edge-secondary',
  'hover:border-accent',
  'group-data-checked:bg-accent group-data-checked:border-accent'
);

function resolvePortalMount(
  searchRef: HTMLElement | undefined,
  mount: PortalMount,
  portalScope: DropdownPortalScope | undefined
): PortalMount {
  if (mount || portalScope !== 'local') return mount;
  return searchRef?.closest<HTMLElement>('.portal-scope') ?? undefined;
}

function DdContent(
  props: ComponentProps<typeof KobalteDropdownMenu.Content> & {
    mount?: PortalMount;
    portalScope?: DropdownPortalScope;
  }
) {
  let searchRef: HTMLDivElement | undefined;
  const [local, rest] = splitProps(props, [
    'class',
    'mount',
    'portalScope',
    'children',
    'ref',
  ]);
  const setContentRef = (el: HTMLElement) => {
    const cleanup = addCtrlJKMenuNavigation(el);
    onCleanup(cleanup);
    (local.ref as ((el: HTMLElement) => void) | undefined)?.(el);
  };
  return (
    <>
      <div class="hidden" ref={searchRef} />
      <KobalteDropdownMenu.Portal
        mount={resolvePortalMount(searchRef, local.mount, local.portalScope)}
      >
        <KobalteDropdownMenu.Content
          class={cn(DD_CONTENT_CLASS, local.class)}
          {...rest}
          ref={setContentRef}
        >
          <div class="flex flex-col gap-px bg-edge-divider size-full">
            {local.children}
          </div>
        </KobalteDropdownMenu.Content>
      </KobalteDropdownMenu.Portal>
    </>
  );
}

function DdSubContent(
  props: ComponentProps<typeof KobalteDropdownMenu.SubContent> & {
    mount?: PortalMount;
    portalScope?: DropdownPortalScope;
  }
) {
  let searchRef: HTMLDivElement | undefined;
  const [local, rest] = splitProps(props, [
    'class',
    'mount',
    'portalScope',
    'children',
    'ref',
  ]);
  const setContentRef = (el: HTMLElement) => {
    const cleanup = addCtrlJKMenuNavigation(el);
    onCleanup(cleanup);
    (local.ref as ((el: HTMLElement) => void) | undefined)?.(el);
  };
  return (
    <>
      <div class="hidden" ref={searchRef} />
      <KobalteDropdownMenu.Portal
        mount={resolvePortalMount(searchRef, local.mount, local.portalScope)}
      >
        <KobalteDropdownMenu.SubContent
          class={cn(DD_CONTENT_CLASS, local.class)}
          {...rest}
          ref={setContentRef}
        >
          <div class="flex flex-col gap-px bg-edge-divider size-full">
            {local.children}
          </div>
        </KobalteDropdownMenu.SubContent>
      </KobalteDropdownMenu.Portal>
    </>
  );
}

function DdGroup(props: ComponentProps<typeof KobalteDropdownMenu.Group>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteDropdownMenu.Group
      class={cn('flex flex-col p-1.5 bg-menu', local.class)}
      {...rest}
    />
  );
}

function DdGroupLabel(
  props: ComponentProps<typeof KobalteDropdownMenu.GroupLabel>
) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteDropdownMenu.GroupLabel
      class={cn(
        'px-2 h-7 flex items-center text-xs text-content-tertiary',
        local.class
      )}
      {...rest}
    />
  );
}

function DdCheckboxItem(
  props: ComponentProps<typeof KobalteDropdownMenu.CheckboxItem>
) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <KobalteDropdownMenu.CheckboxItem
      class={cn(DD_ROW_CLASS, local.class)}
      {...rest}
    >
      <div class={DD_CHECKBOX_BOX_CLASS}>
        <KobalteDropdownMenu.ItemIndicator>
          <CheckIcon class="size-2.5" />
        </KobalteDropdownMenu.ItemIndicator>
      </div>
      {local.children}
    </KobalteDropdownMenu.CheckboxItem>
  );
}

function DdSubTrigger(
  props: ComponentProps<typeof KobalteDropdownMenu.SubTrigger>
) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteDropdownMenu.SubTrigger
      class={cn(DD_ROW_CLASS, 'justify-between', local.class)}
      {...rest}
    />
  );
}

function DdItem(props: ComponentProps<typeof KobalteDropdownMenu.Item>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KobalteDropdownMenu.Item class={cn(DD_ROW_CLASS, local.class)} {...rest} />
  );
}

function DdSub(props: ComponentProps<typeof KobalteDropdownMenu.Sub>) {
  return <KobalteDropdownMenu.Sub gutter={2} shift={-7} {...props} />;
}

function DdTrigger(
  props: ComponentProps<typeof KobalteDropdownMenu.Trigger> & ButtonProps
) {
  return (
    <KobalteDropdownMenu.Trigger
      variant="base"
      as={Button}
      size="sm"
      {...props}
    />
  );
}

const DropdownV2 = Object.assign(
  (props: ComponentProps<typeof KobalteDropdownMenu>) => (
    <KobalteDropdownMenu gutter={4} {...props} />
  ),
  {
    CheckboxItem: DdCheckboxItem,
    SubContent: DdSubContent,
    SubTrigger: DdSubTrigger,
    GroupLabel: DdGroupLabel,
    Content: DdContent,
    Trigger: DdTrigger,
    Group: DdGroup,
    Item: DdItem,
    Sub: DdSub,
  }
);

function ComponentTokenDebug() {
  let rootRef: HTMLDivElement | undefined;
  const [textCells, setTextCells] = createSignal<ContrastCell[]>([]);
  const [fillCells, setFillCells] = createSignal<ContrastCell[]>([]);
  // Local-only state for the demo toggles (they're not wired to anything global).
  const [demoToggleA, setDemoToggleA] = createSignal(true);
  const [demoToggleB, setDemoToggleB] = createSignal(false);

  onMount(() => {
    // Sync the toggle to whatever the app flag already set on <html>.
    setSemanticV2(document.documentElement.classList.contains('semantic-v2'));
  });

  const applyFlag = (on: boolean) => {
    document.documentElement.classList.toggle('semantic-v2', on);
    setSemanticV2(on);
  };

  // Recompute contrast whenever the flag or theme depth changes token values.
  createEffect(() => {
    semanticV2();
    themeDepth();
    requestAnimationFrame(() => {
      if (!rootRef) return;
      setTextCells(readContrastMatrix(rootRef, A11Y_TEXT, A11Y_SURFACES));
      setFillCells(readContrastMatrix(rootRef, A11Y_FILL_TEXT, A11Y_FILLS));
    });
  });

  return (
    <div ref={rootRef} class="size-full overflow-auto bg-panel p-6">
      <div class="flex flex-col gap-8 max-w-6xl mx-auto">
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <h1 class="text-2xl font-bold text-ink">Component & Token Debug</h1>
          <div class="flex items-center gap-2 text-sm text-ink">
            <ToggleSwitch checked={semanticV2()} onChange={applyFlag} />
            <span>
              <span class="font-medium">semantic-v2</span>{' '}
              <span class="text-ink-muted">
                ({semanticV2() ? 'on — migrated values' : 'off — aliases'})
              </span>
            </span>
          </div>
        </div>

        <div class="rounded-lg p-3 text-sm text-alert bg-alert-bg ring-1 ring-edge-muted">
          The new tokens' migrated values only apply with{' '}
          <code>semantic-v2</code> on. Toggling it also flips <code>Layer</code>{' '}
          to passthrough (elevation moves into the tokens), so{' '}
          <code>Surface</code>-based panels flatten unless they've adopted a
          role token.
        </div>

        {/* Surfaces */}
        <Section
          title="Surface tokens"
          note="Opaque, elevation-derived (panel < card < menu < toast). panel is flag-only (no bg utility); consumed via --surface-fill / var(--color-panel)."
        >
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <For each={SURFACE_TOKENS}>
              {(s) => (
                <Swatch
                  label={s.label}
                  sub={s.var}
                  class={s.cls}
                  style={
                    s.cls ? undefined : { 'background-color': `var(${s.var})` }
                  }
                />
              )}
            </For>
          </div>
        </Section>

        {/* Content ramp */}
        <Section
          title="Content (text) ramp"
          note="text-content-primary/secondary/tertiary rename the ink ramp; disabled/placeholder stay as states."
        >
          <div class="rounded-md p-4 bg-card ring-1 ring-edge-muted flex flex-col gap-3">
            <For each={CONTENT_TOKENS}>
              {(t) => (
                <div class="flex flex-col gap-1">
                  <span class="text-xs text-ink-extra-muted font-mono">
                    {t.name}
                  </span>
                  <p class={cn('text-base', t.cls)}>{LOREM_MEDIUM}</p>
                </div>
              )}
            </For>
            <div class="flex flex-col gap-1">
              <span class="text-xs text-ink-extra-muted font-mono">
                text-content-link
              </span>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                class="text-base text-content-link hover:text-content-link-hover underline underline-offset-2 w-fit"
              >
                A link, hover to see text-content-link-hover
              </a>
            </div>
          </div>
        </Section>

        {/* Borders */}
        <Section
          title="Border tokens"
          note="Translucent, ink-tinted, adaptive — should read consistently on any surface."
        >
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <For each={['bg-surface', 'bg-menu'] as const}>
              {(surfaceCls) => (
                <div
                  class={cn(
                    'rounded-md p-4 ring-1 ring-edge-muted flex flex-col gap-3',
                    surfaceCls
                  )}
                >
                  <span class="text-xs text-ink-muted font-mono">
                    on {surfaceCls}
                  </span>
                  <div class="grid grid-cols-3 gap-3">
                    <For each={BORDER_TOKENS}>
                      {(b) => (
                        <div
                          class={cn(
                            'rounded-md p-3 min-h-16 border flex items-end',
                            b.cls
                          )}
                        >
                          <span class="text-[10px] text-ink-extra-muted font-mono break-all">
                            {b.name}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Section>

        {/* TokenButton — a button built on the new tokens */}
        <Section
          title="TokenButton (new tokens)"
          note="primary/secondary/ghost/destructive/link/cta × sm/md/lg. Neutral fills reuse the content ramp for text (no on-* tokens); hover/active are translucent overlays. cta is the quarantined accent case."
        >
          <div class="rounded-md p-4 bg-card ring-1 ring-edge-muted flex flex-col gap-5">
            <div class="grid grid-cols-2 gap-x-6 gap-y-4">
              <span class="text-xs text-ink-muted font-medium">
                Normal (rounded-md)
              </span>
              <span class="text-xs text-ink-muted font-medium">
                Fully rounded (rounded-full)
              </span>
              <For each={TOKEN_BUTTON_VARIANTS}>
                {(variant) => (
                  <>
                    <span class="col-span-2 text-xs text-ink-extra-muted font-mono">
                      variant="{variant}"
                    </span>
                    <ButtonSet variant={variant} />
                    <ButtonSet variant={variant} pill />
                  </>
                )}
              </For>
            </div>

            <div class="flex flex-col gap-2">
              <span class="text-xs text-ink-extra-muted font-mono">
                raw state overlays
              </span>
              <div class="flex flex-wrap gap-3">
                <For each={BUTTON_STATES}>
                  {(s) => (
                    <div
                      class={cn(
                        'rounded-md px-3 py-2 text-xs text-ink-muted font-mono ring-1 ring-edge-muted',
                        s.cls
                      )}
                    >
                      {s.name}
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Section>

        {/* TokenTextField */}
        <Section
          title="TokenTextField (new tokens)"
          note="filled/outline/ghost × sm/md/lg. filled uses bg-input, outline/ghost stay transparent with edge-* rings; focus rings use edge-primary / accent."
        >
          <div class="rounded-md p-4 bg-card ring-1 ring-edge-muted grid grid-cols-1 md:grid-cols-3 gap-6">
            <For each={TEXTFIELD_VARIANTS}>
              {(variant) => (
                <div class="flex flex-col gap-3">
                  <span class="text-xs text-ink-extra-muted font-mono">
                    variant="{variant}"
                  </span>
                  <For each={TEXTFIELD_SIZES}>
                    {(size) => (
                      <TokenTextField
                        variant={variant}
                        size={size}
                        placeholder={`${variant} ${size}`}
                      />
                    )}
                  </For>
                  <TokenTextField
                    variant={variant}
                    placeholder="Disabled"
                    disabled
                  />
                </div>
              )}
            </For>
          </div>
        </Section>

        {/* Markdown input */}
        <Section
          title="Markdown input"
          note="Uses ChannelInput's MarkdownShell primitive, styled like the text field (fill + focus-within ring) instead of Surface. Supports **bold**, _italic_, mentions, etc."
        >
          <div class="rounded-md p-4 bg-card ring-1 ring-edge-muted grid grid-cols-1 md:grid-cols-3 gap-6">
            <For each={TEXTFIELD_VARIANTS}>
              {(variant) => (
                <div class="flex flex-col gap-2">
                  <span class="text-xs text-ink-extra-muted font-mono">
                    {variant}
                  </span>
                  <TokenMarkdownInput variant={variant} />
                </div>
              )}
            </For>
          </div>
        </Section>

        {/* Select */}
        <Section
          title="Select"
          note="Kobalte Select — trigger mimics the outline text field; the listbox reuses the menu surface (bg-menu), highlighted rows use button-hover, selected uses button-selected."
        >
          <div class="rounded-md p-4 bg-card ring-1 ring-edge-muted flex flex-wrap gap-4 items-start">
            <TokenSelect />
          </div>
        </Section>

        {/* Combobox */}
        <Section
          title="Combobox"
          note="Filterable Kobalte Combobox on the same tokens. Simple = single-select; complex = colored option rows + a sticky action footer (create / manage)."
        >
          <div class="rounded-md p-4 bg-card ring-1 ring-edge-muted flex flex-wrap gap-6 items-start">
            <div class="flex flex-col gap-2">
              <span class="text-xs text-ink-extra-muted font-mono">simple</span>
              <SimpleCombobox />
            </div>
            <div class="flex flex-col gap-2">
              <span class="text-xs text-ink-extra-muted font-mono">
                with actions
              </span>
              <ActionCombobox />
            </div>
          </div>
        </Section>

        {/* Segmented / tabbed control */}
        <Section
          title="Segmented control"
          note="@ui TabbedControl — the inset-tabs style (checked tab filled)."
        >
          <div class="rounded-md p-4 bg-card ring-1 ring-edge-muted">
            <div class="w-72">
              <SegmentedDemo />
            </div>
          </div>
        </Section>

        {/* Avatar */}
        <Section
          title="Avatar"
          note="Reimplemented with tokens — bg-accent-90 fill."
        >
          <div class="rounded-md p-4 bg-card ring-1 ring-edge-muted flex flex-wrap gap-6 items-center">
            <div class="flex items-center gap-3">
              <For each={['sm', 'md', 'lg'] as const}>
                {(size) => <TokenAvatar size={size}>JD</TokenAvatar>}
              </For>
            </div>
            <TokenAvatarGroup>
              <TokenAvatar>AB</TokenAvatar>
              <TokenAvatar>CD</TokenAvatar>
              <TokenAvatar>EF</TokenAvatar>
              <TokenAvatar class="text-content-primary bg-button-primary">
                +3
              </TokenAvatar>
            </TokenAvatarGroup>
          </div>
        </Section>

        {/* Button group */}
        <Section
          title="Button group"
          note="Reimplemented with tokens — joined edges via ring/divide-edge-secondary, hover via button-hover."
        >
          <div class="rounded-md p-4 bg-card ring-1 ring-edge-muted flex flex-wrap gap-6 items-center">
            <TokenButtonGroup items={['Day', 'Week', 'Month']} />
            <TokenButtonGroup
              items={['All', 'Unread', 'Mentions', 'Archived']}
            />
          </div>
        </Section>

        {/* Menus — always open, non-blocking static mocks */}
        <Section
          title="Menus (always open)"
          note="Static mocks of the real menu surface (MENU_CONTENT_CLASS → bg-menu). Rendered inline as plain divs — no portal/focus-trap, so the rest of the page stays fully interactive."
        >
          <div class="flex flex-wrap items-start gap-4">
            <div class={cn(MENU_CONTENT_CLASS, 'w-56')}>
              <MenuRow shortcut="⌘N">New document</MenuRow>
              <MenuRow shortcut="⌘D">Duplicate</MenuRow>
              <MenuRow destructive shortcut="⌘⌫">
                Delete
              </MenuRow>
              <MenuRow disabled>Archived action</MenuRow>
            </div>

            <div class={cn(MENU_CONTENT_CLASS, 'w-56')}>
              <div class="w-full px-2 py-1 text-xs text-ink-extra-muted">
                View
              </div>
              <MenuRow selected>Inbox</MenuRow>
              <MenuRow>Projects</MenuRow>
              <MenuRow>Settings</MenuRow>
              <div class="w-full my-1 h-px bg-edge-divider" />
              <div class="w-full px-2 py-1 text-xs text-ink-extra-muted">
                Sort
              </div>
              <MenuRow>Newest</MenuRow>
              <MenuRow>Oldest</MenuRow>
            </div>

            <p class="text-sm text-ink-muted max-w-xs">
              These menus are always visible and don't block the page — try the
              toggles and text fields above while they're open.
            </p>
          </div>
        </Section>

        {/* Real @ui components */}
        <Section
          title="@ui components"
          note="Existing components rendered on the current token context — for spotting anything still bound to Surface/Layer internals."
        >
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="portal-scope relative rounded-md p-4 bg-card ring-1 ring-edge-muted flex flex-col gap-4 min-h-64">
              <h3 class="text-sm font-semibold text-ink">Button variants</h3>
              <div class="flex flex-wrap gap-2 items-center">
                <For each={UI_BUTTON_VARIANTS}>
                  {(variant) => <Button variant={variant}>{variant}</Button>}
                </For>
                <Button variant="base" disabled>
                  disabled
                </Button>
              </div>

              <h3 class="text-sm font-semibold text-ink mt-2">
                Dropdown (v2 — token-styled copy)
              </h3>
              <div class="flex flex-wrap gap-2">
                <DropdownV2>
                  <DropdownV2.Trigger>Open menu</DropdownV2.Trigger>
                  <DropdownV2.Content portalScope="local">
                    <DropdownV2.Group>
                      <DropdownV2.GroupLabel>Actions</DropdownV2.GroupLabel>
                      <DropdownV2.Item>New document</DropdownV2.Item>
                      <DropdownV2.Item>Duplicate</DropdownV2.Item>
                      <DropdownV2.Item disabled>
                        Archived action
                      </DropdownV2.Item>
                      <DropdownV2.Sub>
                        <DropdownV2.SubTrigger>
                          Move to
                          <span class="text-content-tertiary">›</span>
                        </DropdownV2.SubTrigger>
                        <DropdownV2.SubContent portalScope="local">
                          <DropdownV2.Group>
                            <DropdownV2.Item>Design</DropdownV2.Item>
                            <DropdownV2.Item>Engineering</DropdownV2.Item>
                          </DropdownV2.Group>
                        </DropdownV2.SubContent>
                      </DropdownV2.Sub>
                    </DropdownV2.Group>
                    <DropdownV2.Group>
                      <DropdownV2.CheckboxItem checked>
                        Show hidden items
                      </DropdownV2.CheckboxItem>
                    </DropdownV2.Group>
                  </DropdownV2.Content>
                </DropdownV2>
              </div>
            </div>

            <div class="rounded-md p-4 bg-card ring-1 ring-edge-muted flex flex-col gap-3">
              <h3 class="text-sm font-semibold text-ink">Controls</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-ink-muted">
                <Checkbox checked class="flex items-center gap-2">
                  <Checkbox.Control />
                  Checked
                </Checkbox>
                <Checkbox class="flex items-center gap-2">
                  <Checkbox.Control />
                  Empty
                </Checkbox>
                <ToggleSwitch
                  checked={demoToggleA()}
                  onChange={setDemoToggleA}
                  label={`Local toggle: ${demoToggleA() ? 'on' : 'off'}`}
                />
                <ToggleSwitch
                  checked={demoToggleB()}
                  onChange={setDemoToggleB}
                  label={`Local toggle: ${demoToggleB() ? 'on' : 'off'}`}
                />
              </div>
              <Tooltip label="Tooltip surface uses bg-menu once adopted">
                <span class="text-sm text-ink w-fit underline decoration-dotted">
                  Hover for a tooltip
                </span>
              </Tooltip>
            </div>
          </div>

          {/* Panel adopts the flag-only `panel` token via --surface-fill */}
          <Panel depth={1}>
            <Panel.Header class="px-4">
              <span class="text-sm font-semibold text-ink">
                Panel (uses the panel token) with a card on top
              </span>
            </Panel.Header>
            <Panel.Body class="p-4 flex flex-col gap-3">
              <p class="text-sm text-ink-muted">{LOREM_SHORT}</p>
              <div class="rounded-md p-3 bg-card ring-1 ring-edge-secondary">
                <p class="text-sm text-ink">
                  Card resting on the panel — should read one step lighter when
                  the flag is on.
                </p>
              </div>
            </Panel.Body>
            <Panel.Footer class="px-4 justify-end gap-2">
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
              <Button variant="active" size="sm">
                Confirm
              </Button>
            </Panel.Footer>
          </Panel>
        </Section>

        {/* Accessibility */}
        <Section
          title="Accessibility — WCAG contrast"
          note="Contrast ratios for each content token on each surface. Normal text needs 4.5:1 (AA) / 7:1 (AAA); large text 3:1. panel reads '—' until the flag is on."
        >
          <ContrastTable
            cells={textCells()}
            rows={A11Y_TEXT}
            cols={A11Y_SURFACES}
            rowHeader="content / surface"
          />
        </Section>

        <Section
          title="Accessibility — fills"
          note="The 'no on-* tokens' bet: content text stays legible on neutral button fills (button-* stays in the b* family). accent is the quarantined exception."
        >
          <ContrastTable
            cells={fillCells()}
            rows={A11Y_FILL_TEXT}
            cols={A11Y_FILLS}
            rowHeader="text / fill"
          />
        </Section>
      </div>
    </div>
  );
}

export default ComponentTokenDebug;
