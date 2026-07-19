import { useNavigate } from '@solidjs/router';
import { listen } from '@tauri-apps/api/event';
import { createEffect, onCleanup, onMount } from 'solid-js';

type NavigateEvent = {
  path: string;
  query: string;
};

/**
 * Hosts of the hosted web app. Hyperlinks to `/app/...` paths on these hosts
 * (e.g. https://macro.com/app/task/<id>) are app links and must open inside
 * the app instead of the web browser.
 * Keep in sync with APP_LINK_DOMAINS in tauri/src-tauri/src/lib.rs and the
 * universal link hosts in tauri.conf.json.
 */
const APP_LINK_HOSTS = new Set([
  'macro.com',
  'dev.macro.com',
  'staging.macro.com',
]);

/**
 * Converts an app link (https://macro.com/app/task/<id>) into the equivalent
 * internal router path (/task/<id>), mirroring how universal links are
 * remapped by MacroScheme::from_url on the Rust side (the Tauri router is
 * based at '/', so the '/app' prefix is stripped).
 *
 * Returns null when the url is not an app link.
 */
export function macroAppLinkToInternalPath(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!APP_LINK_HOSTS.has(url.hostname)) return null;
  const path = url.pathname;
  if (path !== '/app' && !path.startsWith('/app/')) return null;
  const internalPath = path.slice('/app'.length) || '/';
  return `${internalPath}${url.search}`;
}

/**
 * Intercepts clicks on hyperlinks to the hosted web app and performs an
 * in-app navigation instead of letting the webview hand them to the OS
 * (which opens the web browser). Registered on the document in the capture
 * phase so it runs before per-editor link handlers call window.open.
 */
function useAppLinkClickIntercept() {
  const navigate = useNavigate();

  const handleClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // composedPath resolves the real target inside shadow roots (email bodies)
    const target = e.composedPath()[0];
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a[href]');
    if (!anchor) return;
    // mention pills already navigate in-app via their own handlers
    if (anchor.classList.contains('internal-link')) return;
    // links inside editors open the link-edit popover instead of navigating
    if ((anchor as HTMLElement).isContentEditable) return;

    const internalPath = macroAppLinkToInternalPath(
      (anchor as HTMLAnchorElement).href
    );
    if (internalPath === null) return;

    e.preventDefault();
    e.stopPropagation();
    navigate(internalPath);
  };

  onMount(() => {
    document.addEventListener('click', handleClick, { capture: true });
    onCleanup(() => {
      document.removeEventListener('click', handleClick, { capture: true });
    });
  });
}

/// this must be used as a child of router
export function useTauriNavigationEffect() {
  const navigate = useNavigate();

  useAppLinkClickIntercept();

  createEffect(() => {
    let unsubscribe: () => void | undefined;

    async function inner() {
      unsubscribe = await listen<NavigateEvent>('navigate', (ev) => {
        console.info({ ev });
        const path = ev.payload.query
          ? `${ev.payload.path}?${ev.payload.query}`
          : ev.payload.path;
        navigate(path);
      });
    }
    inner();

    return onCleanup(() => {
      if (unsubscribe) {
        unsubscribe();
      }
    });
  });
}
