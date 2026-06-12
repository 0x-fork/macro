import { createSignal } from 'solid-js';

// Registry of mounted share-button permission resources. Lives apart from
// ShareButton.tsx so non-UI callers (service-storage refetchResources) don't
// pull the share modal UI into the initial bundle.

const [refetchArray, setRefetchArray] = createSignal<(() => void)[]>([]);

export const addShareButtonRefetch = (refetch: () => void) => {
  setRefetchArray((prev) => [...prev, refetch]);
};

export const removeShareButtonRefetch = (refetch: () => void) => {
  setRefetchArray((prev) => prev.filter((r) => r !== refetch));
};

export const refetchDocumentShareButtonResource = () => {
  const refetchArray_ = refetchArray();
  if (refetchArray_.length === 0) {
    console.warn('no document share permission refetch functions initialized');
    return;
  }
  refetchArray_.forEach((refetch) => refetch());
};
