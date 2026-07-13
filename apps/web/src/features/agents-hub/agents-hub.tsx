import { NewChatComposer } from '@app/features/home/new-chat-composer';
import { SplitHeaderLeft } from '@components/app/split-layout/components/SplitHeader';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { DragDropWrapper } from '@core/component/AI/component/DragDrop';
import { ChatInputProvider } from '@core/component/AI/context';
import { createEffect } from 'solid-js';
import { AgentsSidePanel } from './agents-side-panel';

/**
 * Desktop Agents view: a fresh chat composer front and center, with a side
 * panel of automations and recent agent sessions on the right. Mobile keeps
 * the soup list (see the `agents` registration in componentRegistry).
 */
export const AgentsHub = () => {
  const panel = useSplitPanelOrThrow();

  createEffect(() => {
    panel.handle.setDisplayName('Agents');
  });

  return (
    <ChatInputProvider>
      <DragDropWrapper class="relative size-full">
        <SplitHeaderLeft>
          <div class="h-full flex items-center">
            <span class="text-sm font-semibold">Agents</span>
          </div>
        </SplitHeaderLeft>
        <div class="flex size-full min-h-0 bg-surface">
          <main class="flex min-w-0 flex-1 flex-col">
            <div class="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
              <div class="flex w-full max-w-2xl flex-col gap-4">
                <h1 class="px-1 text-xl font-normal tracking-tight text-ink">
                  What should your agent work on?
                </h1>
                <NewChatComposer />
              </div>
            </div>
          </main>
          <AgentsSidePanel />
        </div>
      </DragDropWrapper>
    </ChatInputProvider>
  );
};
