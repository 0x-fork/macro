import { Toast } from '@kobalte/core/toast';
import { Portal } from 'solid-js/web';

export function ToastRegion() {
  return (
    <Portal>
      <div class="fixed bottom-2 right-2 m-0 list-none outline-none pointer-events-none z-toast-region">
        <Toast.Region
          regionId="toast-region"
          duration={Infinity}
          pauseOnInteraction={false}
        >
          <Toast.List class="absolute bottom-0 right-0 flex flex-col p-2 sm:p-4 gap-2" />
        </Toast.Region>
        <Toast.Region regionId="stable-toast" duration={Infinity}>
          <Toast.List class="absolute bottom-0 right-0 flex flex-col p-2 sm:p-4 gap-2" />
        </Toast.Region>
      </div>

      {/*
        Mobile-only region: centered above the mobile dock. At most one
        transient toast is visible — Toast.tsx dismisses the previous one as
        soon as a new one is shown. Persistent prompts opt out of that slot and
        stack above it until answered, so this list needs real spacing.
      */}
      <div
        class="fixed left-1/2 -translate-x-1/2 w-full max-w-[420px] px-(--mobile-chrome-gutter) pointer-events-none z-toast-region"
        style={{
          bottom: 'calc(var(--mobile-content-inset-bottom, 0px) + 12px)',
        }}
      >
        <Toast.Region
          regionId="mobile-toast-region"
          duration={Infinity}
          pauseOnInteraction={false}
        >
          <Toast.List class="flex flex-col gap-2" />
        </Toast.Region>
      </div>
    </Portal>
  );
}
