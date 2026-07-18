import { MobileDrawer } from '@components/app/mobile/MobileDrawer';
import { isMobile } from '@core/mobile/isMobile';
import { type EntityData, InlineEntity } from '@entity';
import { cn } from '@ui';
import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  For,
  type JSX,
  onCleanup,
  Show,
  useContext,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useSoupEntityActions } from '../actions/use-soup-entity-actions';

type SoupMobileActionDrawerState = {
  open: (source: EntityData, targets: readonly EntityData[]) => void;
  close: () => void;
};

const SoupMobileActionDrawerContext =
  createContext<SoupMobileActionDrawerState>();

export const useMaybeSoupMobileActionDrawer = () =>
  useContext(SoupMobileActionDrawerContext);

function SoupMobileActionDrawer(props: {
  open: Accessor<boolean>;
  source: Accessor<EntityData | undefined>;
  targets: Accessor<readonly EntityData[]>;
  close: () => void;
}) {
  const entityActions = useSoupEntityActions();
  const actions = () => entityActions.build(props.targets());

  return (
    <MobileDrawer
      side="bottom"
      open={props.open()}
      closeOnOutsidePointerStrategy="pointerdown"
      onOpenChange={(open) => !open && props.close()}
      preventScroll={false}
      preventScrollbarShift={false}
      restoreFocus={false}
      noOutsidePointerEvents={false}
    >
      <MobileDrawer.Portal>
        <MobileDrawer.Overlay class="fixed inset-0 z-modal-overlay bg-modal-overlay pattern-diagonal-4 pattern-edge-muted" />
        <MobileDrawer.Content aria-label="Entity actions">
          <MobileDrawer.Handle />
          <Show when={props.source()}>
            {(entity) => (
              <div class="shrink-0 px-4 pb-4 text-sm font-medium text-ink-muted">
                <InlineEntity entity={entity()} />
                <Show when={props.targets().length > 1}>
                  <span class="ml-2 text-ink-extra-muted">
                    +{props.targets().length - 1} selected
                  </span>
                </Show>
              </div>
            )}
          </Show>
          <MobileDrawer.Section class="flex shrink-0 flex-col">
            <For each={actions()}>
              {(action) => (
                <button
                  type="button"
                  class={cn(
                    'flex items-center gap-3 bg-surface px-4 py-3 text-left text-sm not-last:mb-px hover:bg-hover hover-transition-bg',
                    action.destructive ? 'text-failure-ink' : 'text-ink'
                  )}
                  onClick={async () => {
                    try {
                      await action.run();
                    } finally {
                      props.close();
                    }
                  }}
                >
                  <Dynamic component={action.icon} class="size-4 shrink-0" />
                  <span>{action.label}</span>
                </button>
              )}
            </For>
            <Show when={actions().length === 0}>
              <div class="px-4 py-3 text-sm text-ink-extra-muted">
                No actions available
              </div>
            </Show>
          </MobileDrawer.Section>
        </MobileDrawer.Content>
      </MobileDrawer.Portal>
    </MobileDrawer>
  );
}

export function SoupMobileActionDrawerManager(props: {
  children: JSX.Element;
}) {
  if (!isMobile()) return props.children;

  const [drawerOpen, setDrawerOpen] = createSignal(false);
  const [source, setSource] = createSignal<EntityData>();
  const [targets, setTargets] = createSignal<readonly EntityData[]>([]);
  let wrapper: HTMLDivElement | undefined;

  const state: SoupMobileActionDrawerState = {
    open: (entity, nextTargets) => {
      setSource(() => entity);
      setTargets(() => [...nextTargets]);
      setDrawerOpen(true);
    },
    close: () => setDrawerOpen(false),
  };

  createEffect(() => {
    if (!drawerOpen() || !wrapper) return;
    const blockTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    wrapper.addEventListener('touchmove', blockTouchMove, {
      capture: true,
      passive: false,
    });
    onCleanup(() =>
      wrapper?.removeEventListener('touchmove', blockTouchMove, {
        capture: true,
      })
    );
  });

  return (
    <SoupMobileActionDrawerContext.Provider value={state}>
      <div ref={wrapper} class="size-full min-h-0 min-w-0">
        {props.children}
      </div>
      <SoupMobileActionDrawer
        open={drawerOpen}
        source={source}
        targets={targets}
        close={state.close}
      />
    </SoupMobileActionDrawerContext.Provider>
  );
}
