import type { ListView } from '@app/constants/list-views';
import { globalSplitManager } from '@app/signal/splitLayout';
import { focusInput } from '@core/directive/focusInput';
import { hapticImpact } from '@core/mobile/haptics';
import DotsThreeIcon from '@icon/dots-three.svg';
import HouseIcon from '@icon/house.svg';
import PlusIcon from '@icon/plus.svg';
import { AnimatedChannelIcon } from '@macro-icons/wide/animating/channel';
import { AnimatedEmailIcon } from '@macro-icons/wide/animating/email';
import { AnimatedFileMdIcon } from '@macro-icons/wide/animating/fileMd';
import { AnimatedInboxIcon } from '@macro-icons/wide/animating/inbox';
import { AnimatedSearchIcon } from '@macro-icons/wide/animating/search';
import { AnimatedStarIcon } from '@macro-icons/wide/animating/star';
import { AnimatedTaskIcon } from '@macro-icons/wide/animating/task';
import { useUserNotificationsQuery } from '@queries/notification/user-notifications';
import { useLocation } from '@solidjs/router';
import { cn } from '@ui';
import {
  type Component,
  createMemo,
  createSignal,
  For,
  type JSX,
  Show,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useSplitLayout } from '../split-layout/layout';
import { MobileCreateDrawer } from './MobileCreateDrawer';
import { MobileDrawer } from './MobileDrawer';

false && focusInput;

const ICON_ANIMATION_DURATION_MS = 500;

type DockItemProps = {
  icon: Component<
    JSX.SvgSVGAttributes<SVGSVGElement> & { triggerAnimation?: boolean }
  >;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: number;
};

function DockItem(props: DockItemProps) {
  const [animating, setAnimating] = createSignal(false);

  return (
    <button
      type="button"
      onPointerDown={() => {
        hapticImpact('light');
        setAnimating(true);
        setTimeout(() => setAnimating(false), ICON_ANIMATION_DURATION_MS);
        props.onClick();
      }}
      class="relative flex items-center justify-center px-2 py-1.5 min-w-0"
    >
      <div
        class={cn(
          'relative flex items-center justify-center h-10 rounded-full transition-all',
          props.active ? 'bg-accent/25 px-4' : 'px-2'
        )}
      >
        <div
          class={cn(
            'size-5 [&_svg]:size-5 transition-colors',
            props.active ? 'text-accent' : 'text-ink-muted'
          )}
        >
          <Dynamic
            component={props.icon}
            triggerAnimation={animating() || props.active}
          />
        </div>
        <Show when={(props.badge ?? 0) > 0}>
          <div
            class={cn(
              'absolute top-0.5 size-2 rounded-full bg-accent',
              props.active ? 'right-1.5' : 'right-0'
            )}
          />
        </Show>
      </div>
    </button>
  );
}

function _SearchDockItem(props: { active: boolean; onClick: () => void }) {
  const [animating, setAnimating] = createSignal(false);

  return (
    <button
      type="button"
      use:focusInput={{
        getTarget: () => document.getElementById('mobile-search-input'),
      }}
      onClick={() => {
        hapticImpact('light');
        setAnimating(true);
        setTimeout(() => setAnimating(false), ICON_ANIMATION_DURATION_MS);
        props.onClick();
      }}
      class="relative flex items-center justify-center px-2 py-1.5 min-w-0"
    >
      <div
        class={cn(
          'relative flex items-center justify-center h-10 rounded-full transition-all',
          props.active ? 'bg-accent/25 px-4' : 'px-2'
        )}
      >
        <div
          class={cn(
            'size-5 [&_svg]:size-5 transition-colors',
            props.active ? 'text-accent' : 'text-ink-muted'
          )}
        >
          <Dynamic
            component={AnimatedSearchIcon}
            triggerAnimation={animating() || props.active}
          />
        </div>
      </div>
    </button>
  );
}

function CreateButton() {
  const [open, setOpen] = createSignal(false);

  return (
    <MobileCreateDrawer open={open()} onOpenChange={setOpen}>
      <button
        type="button"
        class="relative flex items-center justify-center p-2 min-w-0"
        onClick={() => {
          hapticImpact('medium');
          setOpen(true);
        }}
      >
        <div class="flex items-center justify-center size-9 rounded-full bg-accent active:bg-accent/80 transition-colors">
          <PlusIcon class="size-5 text-surface" />
        </div>
      </button>
    </MobileCreateDrawer>
  );
}

interface MoreMenuItem {
  id: ListView;
  icon: Component<
    JSX.SvgSVGAttributes<SVGSVGElement> & { triggerAnimation?: boolean }
  >;
  label: string;
  color: string;
  bgColor: string;
}

function MoreMenu(props: {
  isActive: (id: ListView) => boolean;
  navigate: (id: ListView) => void;
}) {
  const [open, setOpen] = createSignal(false);

  const menuItems: MoreMenuItem[] = [
    {
      id: 'documents',
      icon: AnimatedFileMdIcon,
      label: 'Documents',
      color: 'text-note',
      bgColor: 'bg-note/10',
    },
    {
      id: 'agents',
      icon: AnimatedStarIcon,
      label: 'Agents',
      color: 'text-chat',
      bgColor: 'bg-chat/10',
    },
  ];

  const isAnyActive = createMemo(() =>
    menuItems.some((item) => props.isActive(item.id))
  );

  const handleSelect = (id: ListView) => {
    hapticImpact('light');
    setOpen(false);
    props.navigate(id);
  };

  return (
    <MobileDrawer
      open={open()}
      onOpenChange={setOpen}
      side="bottom"
      breakPoints={[0.5]}
    >
      <MobileDrawer.Trigger
        class="relative flex items-center justify-center px-2 py-1.5 min-w-0"
        onClick={() => hapticImpact('light')}
      >
        <div
          class={cn(
            'relative flex items-center justify-center h-10 rounded-full transition-all',
            isAnyActive() ? 'bg-accent/25 px-4' : 'px-2'
          )}
        >
          <div
            class={cn(
              'size-5 [&_svg]:size-5 transition-colors',
              isAnyActive() ? 'text-accent' : 'text-ink-muted'
            )}
          >
            <DotsThreeIcon />
          </div>
        </div>
      </MobileDrawer.Trigger>
      <MobileDrawer.Portal>
        <MobileDrawer.Overlay class="fixed inset-0 z-modal-overlay bg-modal-overlay" />
        <MobileDrawer.Content class="scrollbar-hide">
          <MobileDrawer.Handle />
          <div class="pb-6 pt-2 px-4">
            <h2 class="text-lg font-semibold text-ink mb-4">More</h2>
            <div class="grid grid-cols-4 gap-3">
              <For each={menuItems}>
                {(item) => (
                  <button
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    class={cn(
                      'flex flex-col items-center gap-2 p-3 rounded-2xl transition-colors',
                      props.isActive(item.id)
                        ? 'bg-accent/10'
                        : 'bg-ink/5 active:bg-ink/10'
                    )}
                  >
                    <div
                      class={cn(
                        'size-10 rounded-xl flex items-center justify-center',
                        item.bgColor
                      )}
                    >
                      <div class={cn('size-5 [&_svg]:size-5', item.color)}>
                        <item.icon />
                      </div>
                    </div>
                    <span
                      class={cn(
                        'text-xs',
                        props.isActive(item.id)
                          ? 'text-accent font-medium'
                          : 'text-ink'
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </MobileDrawer.Content>
      </MobileDrawer.Portal>
    </MobileDrawer>
  );
}

export function MobileDock() {
  const { openWithSplit } = useSplitLayout();
  const location = useLocation();

  const notificationsQuery = useUserNotificationsQuery({ limit: 100 });
  const unreadCount = createMemo(() => {
    const notifications = notificationsQuery.data;
    if (!notifications) return 0;
    return notifications.filter((n) => !n.viewed_at).length;
  });

  const isActive = (id: ListView) => {
    const activeContent = globalSplitManager()?.activeSplit()?.content();
    if (!activeContent) {
      const segments = location.pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] === id;
    }
    return activeContent.id === id;
  };

  const navigate = (id: ListView) => {
    const fgContent = globalSplitManager()?.activeSplit()?.content();
    const isOnSoupView = fgContent?.type === 'component';
    openWithSplit({ type: 'component', id }, { mergeHistory: isOnSoupView });
  };

  return (
    <div class="fixed bottom-0 inset-x-0 z-mobile-nav-bar px-4 pb-3 pointer-events-none">
      <div class="flex flex-row items-center gap-2 pointer-events-auto">
        <div class="flex flex-row items-center bg-surface/50 backdrop-blur-2xl backdrop-saturate-150 rounded-full py-1 px-1 border border-edge">
          <DockItem
            icon={HouseIcon}
            label="Home"
            active={isActive('home')}
            onClick={() => navigate('home')}
          />
          <DockItem
            icon={AnimatedInboxIcon}
            label="Inbox"
            active={isActive('inbox')}
            badge={unreadCount()}
            onClick={() => navigate('inbox')}
          />
          <DockItem
            icon={AnimatedEmailIcon}
            label="Mail"
            active={isActive('mail')}
            onClick={() => navigate('mail')}
          />
          <DockItem
            icon={AnimatedChannelIcon}
            label="Chat"
            active={isActive('channels')}
            onClick={() => navigate('channels')}
          />
          <DockItem
            icon={AnimatedTaskIcon}
            label="Tasks"
            active={isActive('tasks')}
            onClick={() => navigate('tasks')}
          />
          <MoreMenu isActive={isActive} navigate={navigate} />
        </div>
        <div class="bg-surface/50 backdrop-blur-2xl backdrop-saturate-150 rounded-full border border-edge">
          <CreateButton />
        </div>
      </div>
    </div>
  );
}
