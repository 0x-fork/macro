import { cn } from '../utils/classname';

export const FIELD_ROOT_CLASS = 'flex min-w-0 flex-col gap-1.5';

export const FIELD_LABEL_CLASS =
  'text-sm font-medium leading-none text-ink data-disabled:opacity-50';

export const FIELD_DESCRIPTION_CLASS = 'text-xs leading-5 text-ink-muted';

export const FIELD_ERROR_CLASS = 'text-xs leading-5 text-failure-ink';

export const CONTROL_BASE_CLASS = cn(
  'min-w-0 rounded-md bg-input text-ink outline-none transition-[background-color,box-shadow]',
  'placeholder:text-ink-placeholder disabled:opacity-50 disabled:cursor-not-allowed',
  'focus-within:ring-2 focus-within:ring-accent'
);

export const TEXT_CONTROL_CLASS = cn(
  CONTROL_BASE_CLASS,
  'h-9 px-3 text-sm enabled:hover:bg-input-hover'
);

export const TEXTAREA_CONTROL_CLASS = cn(
  CONTROL_BASE_CLASS,
  'min-h-24 px-3 py-2 text-sm resize-y enabled:hover:bg-input-hover'
);

export const TRIGGER_CONTROL_CLASS = cn(
  CONTROL_BASE_CLASS,
  'inline-flex h-9 items-center justify-between gap-2 px-3 text-sm enabled:hover:bg-input-hover'
);

export const COMBO_CONTROL_CLASS = cn(
  CONTROL_BASE_CLASS,
  'inline-flex min-h-9 items-center gap-2 px-3 text-sm enabled:hover:bg-input-hover'
);

export const MENU_CONTENT_CLASS = cn(
  'z-action-menu min-w-48 rounded-xl bg-menu p-1.5 shadow-menu ring-1 ring-edge menu-open-animation'
);

export const MENU_LISTBOX_CLASS =
  'flex max-h-72 w-full flex-col gap-0.5 overflow-y-auto outline-none';

export const MENU_ITEM_CLASS = cn(
  'group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink outline-none select-none',
  'data-highlighted:bg-hover data-selected:bg-active data-disabled:opacity-50 data-disabled:cursor-not-allowed'
);
