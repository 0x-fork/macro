// Lives apart from ShareButton.tsx so light consumers (e.g. the soup entity
// action drawer) don't pull the share modal UI into the initial bundle.
export function getShareDrawerRecipientInput(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[data-share-drawer-recipient] input'
  );
}
