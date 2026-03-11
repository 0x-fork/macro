let pendingSidebarSearchText: string | undefined;

export function setPendingSidebarSearchText(text: string) {
  pendingSidebarSearchText = text;
}

export function takePendingSidebarSearchText() {
  const next = pendingSidebarSearchText;
  pendingSidebarSearchText = undefined;
  return next;
}
