import { isListViewID } from '@app/constants/list-views';
import { MobileTopEdgeFade } from '@components/app/mobile/MobileEdgeFade';
import { isMobile } from '@core/mobile/isMobile';
import CloseIcon from '@phosphor/x.svg';
import { Button, cn, Panel } from '@ui';
import { type JSX, type ParentProps, Show, Suspense } from 'solid-js';
import { splitPanelLayer } from '../layers';
import { useSplitPanelOrThrow } from '../layoutUtils';
import { SplitHeader } from './SplitHeader';
import { SplitToolbar } from './SplitToolbar';

type HeaderProps = {
  overlay?: boolean;
} & (
  | {
      legacySlots?: true;
      children?: never;
    }
  | {
      legacySlots: false;
      children: JSX.Element;
    }
);

/**
 * Split-aware panel header. Consumers choose whether it participates in the
 * panel grid or overlays a full-height body.
 */
export function SplitPanelHeader(props: HeaderProps) {
  const panel = useSplitPanelOrThrow();

  return (
    <Show when={!panel.handle.isPopover()}>
      <Panel.Header
        class={cn(
          'relative block min-h-10.25 touch:min-h-11.25 p-0 overflow-visible border-b-0!',
          splitPanelLayer.controls,
          'mobile:min-h-0 mobile:border-b-0',
          panel.shouldHideSplitHeader() && 'hidden',
          props.overlay &&
            'absolute inset-x-0 top-0 h-10.25! touch:h-11.25! pointer-events-none [&_button]:pointer-events-auto [&_a]:pointer-events-auto [&_[contenteditable]]:pointer-events-auto'
        )}
      >
        <Show
          when={props.legacySlots === false}
          fallback={<SplitHeader ref={panel.setHeaderRef} />}
        >
          <SplitHeader ref={panel.setHeaderRef} legacySlots={false}>
            {props.children}
          </SplitHeader>
        </Show>
      </Panel.Header>
    </Show>
  );
}

/** Split-aware toolbar which automatically collapses when it has no content. */
export function SplitPanelToolbar() {
  const panel = useSplitPanelOrThrow();

  return (
    <Show when={!panel.handle.isPopover()}>
      <Panel.Toolbar
        class={cn(
          'items-start overflow-visible',
          !panel.hasToolbarContent() && 'hidden',
          isMobile() && 'hidden',
          (!panel.previewState[0]() ||
            isListViewID(panel.handle.content().id)) &&
            'border-b-0'
        )}
      >
        <SplitToolbar ref={panel.setToolbarRef} />
      </Panel.Toolbar>
    </Show>
  );
}

type BodyProps = ParentProps<{ class?: string }>;

/** Split-aware body which preserves bottom-panel and mobile-edge behavior. */
export function SplitPanelBody(props: BodyProps) {
  const panel = useSplitPanelOrThrow();

  return (
    <Panel.Body class={props.class}>
      <div class="@container/split size-full min-h-0 overflow-hidden relative flex flex-col">
        <div
          class={cn(
            'min-h-0 min-w-0 overflow-hidden relative',
            panel.bottomPanel() ? 'h-1/2' : 'h-full'
          )}
        >
          <Suspense>{props.children}</Suspense>
        </div>
        <Show when={panel.bottomPanel()}>
          {(bottomPanel) => (
            <div class="h-1/2 min-h-0 min-w-0 border-t border-edge-muted bg-surface flex flex-col">
              <div class="flex h-10 shrink-0 items-center gap-2 border-b border-edge-muted px-2">
                <h3 class="min-w-0 flex-1 truncate text-sm font-medium text-content-secondary">
                  {bottomPanel().title}
                </h3>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  label="Close"
                  onClick={() => bottomPanel().onClose?.()}
                >
                  <CloseIcon />
                </Button>
              </div>
              <div class="min-h-0 flex-1 overflow-hidden">
                {bottomPanel().content()}
              </div>
            </div>
          )}
        </Show>
      </div>
      <MobileTopEdgeFade />
    </Panel.Body>
  );
}

/** Default composed panel layout used by ordinary components and blocks. */
export function StandardSplitPanelContent(props: ParentProps): JSX.Element {
  return (
    <>
      <SplitPanelHeader />
      <SplitPanelToolbar />
      <SplitPanelBody>{props.children}</SplitPanelBody>
    </>
  );
}
