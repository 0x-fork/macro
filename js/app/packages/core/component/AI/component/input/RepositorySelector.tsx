import { throwOnErr } from '@core/util/result';
import CaretDown from '@phosphor-icons/core/regular/caret-down.svg?component-solid';
import GitBranch from '@phosphor-icons/core/regular/git-branch.svg?component-solid';
import { cognitionApiServiceClient } from '@service-cognition/client';
import { useQuery, useQueryClient } from '@tanstack/solid-query';
import { cn, Dropdown } from '@ui';
import { For, Show } from 'solid-js';

/**
 * Per-chat repository picker. Selecting a repository associates it with the
 * chat and begins pre-warming a sandbox server-side; the coding agent then
 * works against it when the main agent delegates a task. Self-contained:
 * reads/writes server state, no chat-input context coupling.
 */
export function RepositorySelector(props: { chatId?: string }) {
  const queryClient = useQueryClient();

  const reposQuery = useQuery(() => ({
    queryKey: ['coding', 'repositories'],
    queryFn: async () =>
      throwOnErr(async () => await cognitionApiServiceClient.getCodingRepositories()),
    staleTime: 60 * 1000,
  }));

  const statusQuery = useQuery(() => {
    const chatId = props.chatId;
    return {
      queryKey: ['coding', 'status', chatId],
      queryFn: async () =>
        throwOnErr(
          async () =>
            await cognitionApiServiceClient.getChatRepository({ chat_id: chatId! })
        ),
      enabled: !!chatId,
      staleTime: 10 * 1000,
    };
  });

  const repositories = () => reposQuery.data?.repositories ?? [];
  const selected = () => statusQuery.data?.repository ?? undefined;
  const status = () => statusQuery.data?.status;

  const label = () => {
    const repo = selected();
    if (!repo) return 'Select repo';
    // Show just the repo name to keep the control compact.
    return repo.split('/').at(-1) ?? repo;
  };

  const handleSelect = async (fullName: string) => {
    const chatId = props.chatId;
    if (!chatId) return;
    await throwOnErr(
      async () =>
        await cognitionApiServiceClient.selectChatRepository({
          chat_id: chatId,
          repository: fullName,
        })
    );
    await queryClient.invalidateQueries({
      queryKey: ['coding', 'status', chatId],
    });
  };

  return (
    <Dropdown placement="top-end">
      <Dropdown.Trigger
        variant="ghost"
        size="sm"
        class={cn(
          'gap-1.5 rounded-lg text-xs',
          status() === 'ready' && 'text-ink'
        )}
      >
        <GitBranch />
        {label()}
        <CaretDown />
      </Dropdown.Trigger>
      <Dropdown.Content>
        <Dropdown.Group>
          <Show
            when={repositories().length > 0}
            fallback={
              <Dropdown.Item class="text-ink-extra-muted" onSelect={() => {}}>
                {reposQuery.isLoading
                  ? 'Loading…'
                  : 'No repositories — connect GitHub'}
              </Dropdown.Item>
            }
          >
            <For each={repositories()}>
              {(repo) => (
                <Dropdown.Item
                  class={cn(
                    'gap-2 text-xs',
                    selected() === repo.full_name && 'font-medium'
                  )}
                  onSelect={() => void handleSelect(repo.full_name)}
                >
                  <GitBranch class="size-4 shrink-0" />
                  <span class="flex-1 truncate">{repo.full_name}</span>
                </Dropdown.Item>
              )}
            </For>
          </Show>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
}
