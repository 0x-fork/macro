import { createSignal } from 'solid-js';

const [pendingSidebarSearchText, setPendingSidebarSearchText] =
  createSignal<string | undefined>();

export { pendingSidebarSearchText, setPendingSidebarSearchText };
