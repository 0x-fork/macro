import { createMemo, createSignal } from 'solid-js';

const soupFilterMounts = new Map<string, HTMLElement>();
const soupTopControlsMounts = new Map<string, HTMLElement>();
const [mountVersion, setMountVersion] = createSignal(0);

export function setSoupFilterMount(splitId: string, mount: HTMLElement | undefined) {
  if (!mount) {
    soupFilterMounts.delete(splitId);
  } else {
    soupFilterMounts.set(splitId, mount);
  }
  setMountVersion((prev) => prev + 1);
}

export function setSoupTopControlsMount(
  splitId: string,
  mount: HTMLElement | undefined
) {
  if (!mount) {
    soupTopControlsMounts.delete(splitId);
  } else {
    soupTopControlsMounts.set(splitId, mount);
  }
  setMountVersion((prev) => prev + 1);
}

export function useSoupFilterMount(splitId: () => string | undefined) {
  return createMemo(() => {
    mountVersion();
    const id = splitId();
    if (!id) return undefined;
    return soupFilterMounts.get(id);
  });
}

export function useSoupTopControlsMount(splitId: () => string | undefined) {
  return createMemo(() => {
    mountVersion();
    const id = splitId();
    if (!id) return undefined;
    return soupTopControlsMounts.get(id);
  });
}
