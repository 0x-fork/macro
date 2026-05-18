import { MobileDrawer } from './MobileDrawer';
import { useSplitLayout } from '../split-layout/layout';
import { hapticImpact } from '@core/mobile/haptics';
import { AnimatedTaskIcon } from '@macro-icons/wide/animating/task';
import { AnimatedFileMdIcon } from '@macro-icons/wide/animating/fileMd';
import { AnimatedEmailIcon } from '@macro-icons/wide/animating/email';
import { AnimatedChannelIcon } from '@macro-icons/wide/animating/channel';
import { cn } from '@ui/utils/classname';
import { For, type ParentProps } from 'solid-js';
import type { Component, JSX } from 'solid-js';

interface CreateOption {
  id: string;
  icon: Component<JSX.SvgSVGAttributes<SVGSVGElement> & { triggerAnimation?: boolean }>;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  action: () => void;
}

interface MobileCreateDrawerProps extends ParentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileCreateDrawer(props: MobileCreateDrawerProps) {
  const { openWithSplit } = useSplitLayout();

  const createOptions: CreateOption[] = [
    {
      id: 'task',
      icon: AnimatedTaskIcon,
      label: 'Task',
      description: 'Create a new task',
      color: 'text-task',
      bgColor: 'bg-task/10',
      action: () => {
        openWithSplit({ type: 'task', id: 'new' });
      },
    },
    {
      id: 'document',
      icon: AnimatedFileMdIcon,
      label: 'Document',
      description: 'Write a new document',
      color: 'text-note',
      bgColor: 'bg-note/10',
      action: () => {
        openWithSplit({ type: 'md', id: 'new' });
      },
    },
    {
      id: 'email',
      icon: AnimatedEmailIcon,
      label: 'Email',
      description: 'Compose an email',
      color: 'text-email',
      bgColor: 'bg-email/10',
      action: () => {
        openWithSplit({ type: 'email', id: 'new' });
      },
    },
    {
      id: 'channel',
      icon: AnimatedChannelIcon,
      label: 'Channel',
      description: 'Start a conversation',
      color: 'text-channel',
      bgColor: 'bg-channel/10',
      action: () => {
        openWithSplit({ type: 'channel', id: 'new' });
      },
    },
  ];

  const handleSelect = (option: CreateOption) => {
    hapticImpact('light');
    props.onOpenChange(false);
    option.action();
  };

  return (
    <MobileDrawer
      open={props.open}
      onOpenChange={props.onOpenChange}
      side="bottom"
      breakPoints={[0.4]}
    >
      {props.children}
      <MobileDrawer.Portal>
        <MobileDrawer.Overlay class="fixed inset-0 z-modal-overlay bg-modal-overlay" />
        <MobileDrawer.Content class="scrollbar-hide">
          <MobileDrawer.Handle />
          <div class="pb-6 pt-2">
            <h2 class="text-lg font-semibold text-ink px-4 mb-4">Create New</h2>
            <div class="grid grid-cols-2 gap-3 px-4">
              <For each={createOptions}>
                {(option) => (
                  <button
                    type="button"
                    onClick={() => handleSelect(option)}
                    class="flex flex-col items-center gap-3 p-4 rounded-2xl bg-ink/5 active:bg-ink/10 transition-colors"
                  >
                    <div class={cn(
                      'size-12 rounded-xl flex items-center justify-center',
                      option.bgColor
                    )}>
                      <div class={cn('size-6 [&_svg]:size-6', option.color)}>
                        <option.icon />
                      </div>
                    </div>
                    <div class="text-center">
                      <div class="text-sm font-medium text-ink">{option.label}</div>
                      <div class="text-xs text-ink-muted mt-0.5">{option.description}</div>
                    </div>
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

MobileCreateDrawer.Trigger = MobileDrawer.Trigger;
