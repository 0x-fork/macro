/**
 * Elements that own their own pointer interactions. A row-level press
 * handler must not hijack presses that start on these (they typically only
 * stop propagation of `click`, which fires after the press).
 */
const INTERACTIVE_DESCENDANT_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="button"]',
  '[data-blocks-navigation]',
].join(', ');

/**
 * Wraps a row activation callback so unified-list items act on press
 * (primary-button mousedown) instead of on click — mouseup latency is the
 * difference between "instant" and "app-like slow". Presses that begin on
 * an interactive descendant (checkbox, expand chevron, inline link) are
 * ignored so those keep their own click behavior. On touch devices the
 * browser only synthesizes mousedown for taps (never scroll gestures), so
 * the same handler is safe there.
 */
export function pressActivation(
  activate: (event: MouseEvent) => void
): (event: MouseEvent) => void {
  return (event) => {
    if (event.button !== 0) return;
    if (event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    const interactive = target?.closest(INTERACTIVE_DESCENDANT_SELECTOR);
    if (
      interactive &&
      interactive !== event.currentTarget &&
      event.currentTarget instanceof Element &&
      event.currentTarget.contains(interactive)
    ) {
      return;
    }
    activate(event);
  };
}
