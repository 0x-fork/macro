type Disposable = { dispose: () => void };

const sessions = new Map<string, Disposable[]>();

const scopeElement = (scopeId: string) => {
  if (typeof document === 'undefined') return null;
  return (
    [...document.querySelectorAll('[data-hotkey-scope]')].find(
      (element) => element.getAttribute('data-hotkey-scope') === scopeId
    ) ?? null
  );
};

export function replaceSoupNavigationSession(
  scopeId: string,
  register: () => Disposable[]
) {
  disposeSoupNavigationSession(scopeId);
  const registrations = [...register()];
  sessions.set(scopeId, registrations);

  if (
    typeof document !== 'undefined' &&
    typeof MutationObserver !== 'undefined'
  ) {
    let scopeWasMounted = scopeElement(scopeId) !== null;
    const observer = new MutationObserver(() => {
      const mounted = scopeElement(scopeId) !== null;
      if (mounted) scopeWasMounted = true;
      else if (scopeWasMounted) disposeSoupNavigationSession(scopeId);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    registrations.push({ dispose: () => observer.disconnect() });
  }
}

export function disposeSoupNavigationSession(scopeId: string) {
  const current = sessions.get(scopeId);
  if (!current) return;
  sessions.delete(scopeId);
  for (const registration of current) registration.dispose();
}

export function hasSoupNavigationSession(scopeId: string) {
  return sessions.has(scopeId);
}
