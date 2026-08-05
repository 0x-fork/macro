export const useAnalytics = () => ({
  track: (event: string, props?: unknown) =>
    console.log('[analytics]', event, props),
});
