import { isMobile } from '@core/mobile/isMobile';
import { Toast, toaster } from '@kobalte/core/toast';
import CheckIcon from '@phosphor/check.svg';
import ExclamationIcon from '@phosphor/exclamation-mark.svg';
import Spinner from '@phosphor/spinner.svg';
import XIcon from '@phosphor/x.svg';
import { Button, cn, Layer, Surface } from '@ui';
import type { Component, JSX } from 'solid-js';
import {
  createEffect,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';

export enum ToastType {
  SUCCESS = 'success',
  FAILURE = 'failure',
  ALERT = 'alert',
  LOADING = 'loading',
}

interface ToastStyle {
  /** Icon component */
  icon: Component<{ class?: string }>;
  /** Text color class for the icon */
  iconColor: string;
  /** Spin the icon (loading spinner) */
  spin?: boolean;
}

const TOAST_STYLES: Record<ToastType, ToastStyle> = {
  [ToastType.SUCCESS]: {
    icon: CheckIcon,
    iconColor: 'text-success',
  },
  [ToastType.FAILURE]: {
    icon: ExclamationIcon,
    iconColor: 'text-failure',
  },
  [ToastType.ALERT]: {
    icon: ExclamationIcon,
    iconColor: 'text-alert',
  },
  [ToastType.LOADING]: {
    icon: Spinner,
    iconColor: 'text-ink-muted',
    spin: true,
  },
};

/** A single entry in the actions row — icon and label rendered as a button */
interface ToastAction {
  label: string;
  icon?: Component<{ class?: string }>;
  onClick: () => void;
}

/**
 * Common options for all toast calls.
 */
interface ToastOptions {
  subtext?: string;
  /** Auto-dismiss duration in ms. When omitted, the toast uses a default 3s timer. */
  duration?: number;
  /** When true, don't render this toast on mobile. */
  hideOnMobile?: boolean;
}

interface ToastSuccessOptions extends ToastOptions {
  actions?: ToastAction[];
  /** When true, bypasses the 3s duplicate-message throttle. */
  stack?: boolean;
}

/**
 * Config for a fully custom toast.
 * Replaces the icon, title, and accent color of the standard layout while
 * still using the shared card chrome and dismiss machinery.
 */
interface CustomToastConfig {
  title: string;
  content?: () => JSX.Element;
  icon?: Component<{ class?: string }>;
  /** Any CSS color value, e.g. 'var(--color-success)' or '#ff6600' */
  color?: string;
  actions?: ToastAction[];
}

interface ToastMessage {
  message: string;
  toastType: ToastType;
  timestamp: number;
  timeoutId: ReturnType<typeof setTimeout>;
  toastId?: number;
  subtext?: string;
  actions?: ToastAction[];
}

const recentToasts: Map<string, ToastMessage> = new Map();
const THROTTLE_DURATION = 3000;

/**
 * The currently-visible mobile toast. The mobile region only shows one toast
 * at a time — each new mobile toast dismisses the previous one immediately.
 * Desktop toasts stack instead, so no tracking is needed there.
 */
let activeMobileToastId: number | undefined;

function dismissActiveMobileToast(region: string): boolean {
  if (region !== 'mobile-toast-region') return false;
  if (activeMobileToastId === undefined) return false;

  const toastId = activeMobileToastId;
  activeMobileToastId = undefined;
  toaster.dismiss(toastId);
  return true;
}

function trackMobileToast(region: string, toastId: number): void {
  if (region === 'mobile-toast-region') {
    activeMobileToastId = toastId;
  }
}

function clearTrackedToast(region: string, toastId: number): void {
  if (region === 'mobile-toast-region' && activeMobileToastId === toastId) {
    activeMobileToastId = undefined;
  }
}

function createToastKey(message: string, type: ToastType): string {
  return `${type}:${message}`;
}

function dismissIfRecent(message: string, type: ToastType): void {
  const key = createToastKey(message, type);
  const existingToast = recentToasts.get(key);
  if (!existingToast) return;

  const now = Date.now();
  if (
    now - existingToast.timestamp < THROTTLE_DURATION &&
    existingToast.toastId != null
  ) {
    toaster.dismiss(existingToast.toastId);
  }
}

// Tell users that an action has successfully completed
function success(
  message: string,
  options?: ToastSuccessOptions
): number | undefined {
  if (!options?.stack) dismissIfRecent(message, ToastType.SUCCESS);
  return createToast(message, ToastType.SUCCESS, options);
}

function dismiss(toastId: number) {
  toaster.dismiss(toastId);
}

// Tell users that an action has failed, because of us
function failure(
  message: string,
  options?: ToastOptions & { actions?: ToastAction[] }
) {
  dismissIfRecent(message, ToastType.FAILURE);
  createToast(message, ToastType.FAILURE, options);
}

// Tell users that an action has failed, because of them
function alert(message: string, options?: ToastOptions) {
  dismissIfRecent(message, ToastType.ALERT);
  createToast(message, ToastType.ALERT, options);
}

function ActionButtons(props: { actions: ToastAction[]; mobile?: boolean }) {
  return (
    <For each={props.actions}>
      {(action) => (
        <Button
          size="sm"
          onClick={action.onClick}
          variant={props.mobile ? 'ghost' : 'contrast'}
          class={cn('shrink-0', props.mobile && 'text-panel text-xs')}
        >
          <Show when={action.icon}>
            {(icon) => (
              <Dynamic
                component={icon()}
                class="size-[1em] touch:min-h-0! touch:min-w-0!"
              />
            )}
          </Show>
          {action.label}
        </Button>
      )}
    </For>
  );
}

function ToastBodyWrapper(props: { mobile?: boolean; children: JSX.Element }) {
  return (
    <Show
      when={props.mobile}
      fallback={
        <Surface
          class="group/toast relative w-full p-3 rounded-lg shadow-menu overflow-visible"
          depth={2}
        >
          {props.children}
        </Surface>
      }
    >
      <Layer depth={3}>
        <div class="island relative w-[90vw] p-2 rounded-xl">
          {props.children}
        </div>
      </Layer>
    </Show>
  );
}

/**
 * Sonner-style hover-reveal close button: a small circle overlapping the
 * top-left corner of the card.
 */
function CornerCloseButton() {
  return (
    <Toast.CloseButton
      class="absolute -top-1.5 -left-1.5 z-10 flex size-5 items-center justify-center
      rounded-full border border-edge-muted bg-(--b0) text-ink-muted shadow-menu
      opacity-0 transition-opacity group-hover/toast:opacity-100 focus-visible:opacity-100
      hover:text-ink"
    >
      <XIcon class="size-3" />
    </Toast.CloseButton>
  );
}

function ToastContent(props: {
  toastId: number;
  toastType?: ToastType;
  message?: string;
  subtext?: string;
  actions?: ToastAction[];
  persistent?: boolean;
  /** When provided, drives the auto-dismiss timer. */
  duration?: number;
  embed?: Component;
  custom?: CustomToastConfig;
  /** Render the mobile variant (island chrome, text-xs, simplified). */
  mobile?: boolean;
  /** Avoid entrance motion when this toast is replacing another toast. */
  skipOpenAnimation?: boolean;
  /** Called when this toast is removed from the DOM, so callers can clean up tracking. */
  onDismiss?: () => void;
}) {
  const styles = () => (props.toastType ? TOAST_STYLES[props.toastType] : null);

  const [isHovered, setIsHovered] = createSignal(false);

  let elapsed = 0;

  onCleanup(() => props.onDismiss?.());

  onMount(() => {
    // Persistent toasts never auto-dismiss
    if (props.persistent) return;

    const duration = props.duration ?? 3000;
    let lastTime: number | null = null;
    let rafId: number;

    const update = () => {
      const currentTime = performance.now();

      if (lastTime === null) {
        lastTime = currentTime;
      }

      // Only accumulate time when not hovered
      if (!isHovered()) {
        elapsed += currentTime - lastTime;
      }
      lastTime = currentTime;

      if (elapsed < duration) {
        rafId = requestAnimationFrame(update);
      } else {
        toaster.dismiss(props.toastId);
      }
    };

    rafId = requestAnimationFrame(update);
    onCleanup(() => cancelAnimationFrame(rafId));
  });

  // Reset timer when user starts hovering
  createEffect(
    on(isHovered, (hovered) => {
      if (hovered && !props.persistent) {
        elapsed = 0;
      }
    })
  );

  return (
    <Toast
      toastId={props.toastId}
      class={cn(
        `relative w-full overflow-visible pointer-events-auto
        transition-[transform,opacity] duration-100 ease-in data-closed:opacity-0 data-[swipe=move]:translate-x-(--kb-toast-swipe-move-x)
        data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:ease-out data-[swipe=cancel]:duration-200`,
        props.mobile
          ? 'data-[swipe=end]:animate-swipe-out'
          : 'data-[swipe=end]:animate-swipe-out-left',
        !props.skipOpenAnimation && 'data-opened:animate-slide-in'
      )}
      persistent={true}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <ToastBodyWrapper mobile={props.mobile}>
        <Switch>
          {/* ── Embed layout ── */}
          <Match when={props.embed}>
            {(embed) => (
              <>
                <Dynamic component={embed()} />
                <Show when={!props.mobile}>
                  <CornerCloseButton />
                </Show>
              </>
            )}
          </Match>

          {/* ── Custom layout ── */}
          <Match when={props.custom}>
            {(customConfig) => (
              <>
                <div class="flex items-center gap-2">
                  <Show when={customConfig().icon && !props.mobile}>
                    {(_) => {
                      const icon = customConfig().icon!;
                      return (
                        <span
                          class="flex size-4 shrink-0 items-center justify-center"
                          style={{ color: customConfig().color }}
                        >
                          <Dynamic component={icon} class="size-4" />
                        </span>
                      );
                    }}
                  </Show>
                  <Toast.Title
                    class={cn(
                      'grow shrink truncate text-left font-medium',
                      props.mobile ? 'text-xs' : 'text-[13px] text-ink'
                    )}
                  >
                    {customConfig().title}
                  </Toast.Title>
                  <Show when={customConfig().actions?.length}>
                    <ActionButtons
                      actions={customConfig().actions!}
                      mobile={props.mobile}
                    />
                  </Show>
                </div>
                <Show when={customConfig().content && !props.mobile}>
                  <div class="mt-1.5 ml-6">{customConfig().content?.()}</div>
                </Show>
                <Show when={!props.mobile}>
                  <CornerCloseButton />
                </Show>
              </>
            )}
          </Match>

          {/* ── Standard layout ── */}
          <Match when={styles()}>
            {(s) => (
              <>
                <div class="flex items-center gap-2">
                  <Dynamic
                    component={s().icon}
                    class={cn(
                      'size-4 shrink-0',
                      s().iconColor,
                      s().spin && 'animate-spin'
                    )}
                  />
                  <div class="min-w-0 grow">
                    <Toast.Title
                      class={cn(
                        'truncate text-left font-medium',
                        props.mobile ? 'text-xs' : 'text-[13px] text-ink'
                      )}
                    >
                      {props.message}
                    </Toast.Title>
                    <Show when={props.subtext && !props.mobile}>
                      <Toast.Description class="mt-0.5 text-left text-xs text-ink-muted">
                        {props.subtext}
                      </Toast.Description>
                    </Show>
                  </div>
                  <Show when={props.actions?.length}>
                    <ActionButtons
                      actions={props.actions!}
                      mobile={props.mobile}
                    />
                  </Show>
                </div>
                <Show when={!props.mobile}>
                  <CornerCloseButton />
                </Show>
              </>
            )}
          </Match>
        </Switch>
      </ToastBodyWrapper>
    </Toast>
  );
}

// ─── promise helper ──────────────────────────────────────────────────────────

async function promise<T>(
  promiseArg: Promise<T>,
  options: {
    loading: string;
    success?: string | ((result: T) => string);
    error?: string | ((error: any) => string);
    toastTypeDeterminer?: (result: T) => ToastType;
    subtext?: string;
    /** When true, don't render the loading/result toasts on mobile. */
    hideOnMobile?: boolean;
  }
): Promise<T> {
  if (isMobile() && options.hideOnMobile) return promiseArg;

  const useMobile = isMobile();
  const region = useMobile ? 'mobile-toast-region' : 'toast-region';
  const skipOpenAnimation = dismissActiveMobileToast(region);

  const toastId = toaster.show(
    (props) => (
      <ToastContent
        toastId={props.toastId}
        toastType={ToastType.LOADING}
        message={options.loading}
        subtext={options.subtext}
        persistent={true}
        mobile={useMobile}
        skipOpenAnimation={skipOpenAnimation}
        onDismiss={() => clearTrackedToast(region, props.toastId)}
      />
    ),
    { region }
  );
  trackMobileToast(region, toastId);

  return promiseArg
    .then((result) => {
      toaster.dismiss(toastId);

      if (options.success) {
        const successMessage =
          typeof options.success === 'function'
            ? options.success(result)
            : options.success;

        const toastType =
          options.toastTypeDeterminer?.(result) ?? ToastType.SUCCESS;

        createToast(successMessage, toastType, {
          hideOnMobile: options.hideOnMobile,
        });
      }

      return result;
    })
    .catch((error) => {
      toaster.dismiss(toastId);
      if (options.error) {
        const errorMessage =
          typeof options.error === 'function'
            ? options.error(error)
            : options.error;
        failure(errorMessage, { hideOnMobile: options.hideOnMobile });
      }
      throw error;
    });
}

// ─── createToast (internal) ──────────────────────────────────────────────────

function createToast(
  message: string,
  toastType: ToastType,
  options?: ToastSuccessOptions
) {
  const { subtext, actions, duration, stack, hideOnMobile } = options ?? {};

  if (isMobile() && hideOnMobile) return undefined;

  if (!stack) {
    const key = createToastKey(message, toastType);
    const existingToast = recentToasts.get(key);
    if (existingToast?.timeoutId) {
      clearTimeout(existingToast.timeoutId);
    }
  }

  const useMobile = isMobile();
  const region = useMobile ? 'mobile-toast-region' : 'toast-region';
  const skipOpenAnimation = dismissActiveMobileToast(region);

  const toastId = toaster.show(
    (props) => (
      <ToastContent
        toastId={props.toastId}
        toastType={toastType}
        message={message}
        subtext={subtext}
        actions={actions}
        duration={duration}
        mobile={useMobile}
        skipOpenAnimation={skipOpenAnimation}
        onDismiss={() => {
          clearTrackedToast(region, props.toastId);
        }}
      />
    ),
    { region }
  );

  trackMobileToast(region, toastId);

  if (!stack) {
    const key = createToastKey(message, toastType);
    const timeoutId = setTimeout(() => {
      recentToasts.delete(key);
    }, THROTTLE_DURATION);
    recentToasts.set(key, {
      message,
      toastType,
      timestamp: Date.now(),
      timeoutId,
      toastId,
      subtext,
      actions,
    });
  }

  return toastId;
}

// ─── embed ───────────────────────────────────────────────────────────────────

function embed(
  component: Component,
  options?: {
    persistent?: boolean;
    duration?: number;
    region?: string;
  }
) {
  const useMobile = isMobile();
  const region =
    options?.region ?? (useMobile ? 'mobile-toast-region' : 'toast-region');
  const skipOpenAnimation = dismissActiveMobileToast(region);
  const toastId = toaster.show(
    (props) => (
      <ToastContent
        toastId={props.toastId}
        embed={component}
        persistent={options?.persistent}
        duration={options?.duration}
        mobile={useMobile}
        skipOpenAnimation={skipOpenAnimation}
        onDismiss={() => clearTrackedToast(region, props.toastId)}
      />
    ),
    { region }
  );
  trackMobileToast(region, toastId);
  return toastId;
}

// ─── custom ──────────────────────────────────────────────────────────────────

/**
 * Show a toast with a fully custom title, icon, accent color, body content,
 * and actions row — while still using the shared card chrome and
 * dismiss machinery.
 */
function custom(
  config: CustomToastConfig,
  options?: {
    persistent?: boolean;
    duration?: number;
    region?: string;
    onDismiss?: () => void;
  }
): number {
  const useMobile = isMobile();
  const region =
    options?.region ?? (useMobile ? 'mobile-toast-region' : 'toast-region');
  const skipOpenAnimation = dismissActiveMobileToast(region);
  const toastId = toaster.show(
    (props) => (
      <ToastContent
        toastId={props.toastId}
        custom={config}
        persistent={options?.persistent}
        duration={options?.duration}
        mobile={useMobile}
        skipOpenAnimation={skipOpenAnimation}
        onDismiss={() => {
          clearTrackedToast(region, props.toastId);
          options?.onDismiss?.();
        }}
      />
    ),
    { region }
  );
  trackMobileToast(region, toastId);
  return toastId;
}

// ─── upload helper (kept for backwards compat) ───────────────────────────────

export function createUploadToast(message: string) {
  return toaster.show(
    (props) => (
      <ToastContent
        toastId={props.toastId}
        toastType={ToastType.LOADING}
        message={message}
        persistent={true}
      />
    ),
    { region: 'stable-toast' }
  );
}

// ─── public API ──────────────────────────────────────────────────────────────

export const toast = {
  success,
  failure,
  alert,
  promise,
  embed,
  custom,
  dismiss,
};
