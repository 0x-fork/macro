export function isBackgroundSendShortcut(event: KeyboardEvent): boolean {
  return event.shiftKey && (event.metaKey || event.ctrlKey);
}
