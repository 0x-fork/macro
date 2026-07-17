import { Toast } from '@kobalte/core/toast';
import { Portal } from 'solid-js/web';

export function ToastRegion() {
  return (
    <Portal>
      {/*
        Desktop toast region: bottom-left, matching the app sidebar width
        (w-60) so toasts never obscure the working canvas. Toasts stack
        vertically — newest closest to the bottom edge, sonner-style.
      */}
      <div class="fixed bottom-2 left-2 w-60 m-0 flex flex-col gap-2 list-none outline-none pointer-events-none z-toast-region">
        <Toast.Region
          regionId="stable-toast"
          duration={Infinity}
          swipeDirection="left"
        >
          <Toast.List class="flex flex-col gap-2 w-full empty:hidden" />
        </Toast.Region>
        <Toast.Region
          regionId="toast-region"
          duration={Infinity}
          pauseOnInteraction={false}
          limit={5}
          swipeDirection="left"
        >
          <Toast.List class="flex flex-col gap-2 w-full empty:hidden" />
        </Toast.Region>
      </div>

      {/*
        Mobile-only region: centered above the mobile dock. Only one toast is
        ever visible — Toast.tsx dismisses the previous mobile toast as soon
        as a new one is shown, so no stacking is needed here.
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
          <Toast.List class="flex flex-col" />
        </Toast.Region>
      </div>
    </Portal>
  );
}
