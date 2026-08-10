import {
  FEATURED_MCP_SERVERS,
  mcpUrlAvailableInEnv,
  mcpUrlSupportsNango,
  QUICK_CONNECT_ICON_MAP,
  type SvgIcon,
} from '@core/component/AI/constant/mcpServers';
import { toast } from '@core/component/Toast/Toast';
import CheckIcon from '@phosphor-icons/core/regular/check.svg?component-solid';
import PlugIcon from '@phosphor-icons/core/regular/plug.svg?component-solid';
import PlusIcon from '@phosphor-icons/core/regular/plus.svg?component-solid';
import XIcon from '@phosphor-icons/core/regular/x.svg?component-solid';
import {
  connectMcpServerViaNango,
  useAddMcpServerMutation,
  useDeleteMcpServerMutation,
  useMcpCatalogQuery,
  useMcpServersQuery,
  useStartMcpAuthMutation,
  useUpdateMcpServerMutation,
} from '@queries/mcp-servers';
import type { CatalogEntryResponse } from '@service-cognition/client';
import type {
  ServerResponse,
  StartAuthResponse,
} from '@service-cognition/generated/schemas';
import { Button, Dialog, Panel, ToggleSwitch } from '@ui';
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { ConnectAction } from './integration-ui';
import { IntegrationRow, SettingsCard, SettingsSection } from './primitives';

/** Best-effort hostname for an MCP server URL — friendlier than the raw URL. */
function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function AddServerForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = createSignal('');
  const [url, setUrl] = createSignal('');
  const [nangoBusy, setNangoBusy] = createSignal(false);
  const addMutation = useAddMcpServerMutation();
  const authMutation = useStartMcpAuthMutation();

  const reset = () => {
    setName('');
    setUrl('');
  };

  const startAuth = (serverName: string, serverUrl: string) => {
    authMutation.mutate(
      { server_name: serverName, server_url: serverUrl },
      {
        onSuccess: (result: StartAuthResponse) => {
          window.open(result.authorization_url, '_blank');
        },
        onError: () => {
          toast.failure('Server added but failed to start authorization');
        },
      }
    );
  };

  const legacySubmit = (n: string, u: string) => {
    addMutation.mutate(
      { server_name: n, url: u },
      {
        onSuccess: () => {
          startAuth(n, u);
          reset();
          props.onOpenChange(false);
        },
        onError: () => {
          toast.failure('Failed to add server');
        },
      }
    );
  };

  const handleSubmit = async () => {
    const n = name().trim();
    const u = url().trim();
    if (!n || !u || nangoBusy()) return;

    // Nango first: it handles OAuth discovery, client registration, and
    // token refresh for any spec-compliant MCP server. Deployments without
    // Nango fall back to the legacy in-house OAuth flow.
    setNangoBusy(true);
    try {
      const outcome = await connectMcpServerViaNango({
        serverUrl: u,
        serverName: n,
      });
      if (outcome === 'unsupported') {
        legacySubmit(n, u);
        return;
      }
      if (outcome === 'connected') {
        toast.success(`${n} connected`);
      }
      reset();
      props.onOpenChange(false);
    } catch {
      toast.failure(`Failed to connect ${n}`);
    } finally {
      setNangoBusy(false);
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => !open && props.onOpenChange(false)}
      position="center"
      class="w-100"
    >
      <Panel depth={2} class="rounded-xl">
        <Panel.Header class="px-6">
          <span class="text-ink text-sm font-semibold">Add MCP Server</span>
        </Panel.Header>
        <Panel.Body class="p-6 flex flex-col gap-5">
          <div class="flex flex-col gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="text-xs text-ink-muted">Name</span>
              <input
                type="text"
                class="settings-input w-full"
                placeholder="My MCP Server"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                  if (e.key === 'Escape') {
                    reset();
                    props.onOpenChange(false);
                  }
                }}
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-xs text-ink-muted">URL</span>
              <input
                type="url"
                class="settings-input w-full"
                placeholder="https://example.com/mcp"
                value={url()}
                onInput={(e) => setUrl(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                  if (e.key === 'Escape') {
                    reset();
                    props.onOpenChange(false);
                  }
                }}
              />
            </label>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <Button
              variant="base"
              size="sm"
              depth={3}
              onClick={() => {
                reset();
                props.onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="active"
              size="sm"
              depth={3}
              disabled={
                !name().trim() ||
                !url().trim() ||
                addMutation.isPending ||
                nangoBusy()
              }
              onClick={handleSubmit}
            >
              {addMutation.isPending || nangoBusy() ? 'Adding...' : 'Add'}
            </Button>
          </div>
        </Panel.Body>
      </Panel>
    </Dialog>
  );
}

// We have no server-side signal for a failed auth, so we remember locally that a
// connect attempt was made. A disconnected server with a recorded attempt is
// treated as a failed connection; the flag is cleared once it authenticates.
const AUTH_ATTEMPT_PREFIX = 'mcp:auth-attempted:';

function readAuthAttempted(url: string): boolean {
  try {
    return localStorage.getItem(AUTH_ATTEMPT_PREFIX + url) === '1';
  } catch {
    return false;
  }
}

function writeAuthAttempted(url: string, attempted: boolean): void {
  try {
    if (attempted) localStorage.setItem(AUTH_ATTEMPT_PREFIX + url, '1');
    else localStorage.removeItem(AUTH_ATTEMPT_PREFIX + url);
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
}

function ServerRow(props: { server: ServerResponse }) {
  const updateMutation = useUpdateMcpServerMutation();
  const deleteMutation = useDeleteMcpServerMutation();
  const authMutation = useStartMcpAuthMutation();
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  const [nangoBusy, setNangoBusy] = createSignal(false);
  const [attempted, setAttempted] = createSignal(
    readAuthAttempted(props.server.url)
  );

  // A recorded attempt on a still-disconnected server means the last connect
  // attempt didn't succeed. Clear the flag once the server authenticates.
  createEffect(() => {
    if (props.server.authenticated && attempted()) {
      writeAuthAttempted(props.server.url, false);
      setAttempted(false);
    }
  });

  const connectionFailed = () => !props.server.authenticated && attempted();

  const handleToggleEnabled = () => {
    updateMutation.mutate(
      { url: props.server.url, enabled: !props.server.enabled },
      {
        onError: () => {
          toast.failure('Failed to update server');
        },
      }
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(
      { url: props.server.url },
      {
        onSuccess: () => {
          toast.success('Server removed');
          setConfirmDelete(false);
        },
        onError: () => {
          toast.failure('Failed to remove server');
          setConfirmDelete(false);
        },
      }
    );
  };

  const legacyAuth = () => {
    authMutation.mutate(
      {
        server_url: props.server.url,
        server_name: props.server.server_name,
      },
      {
        onSuccess: (result: StartAuthResponse) => {
          window.open(result.authorization_url, '_blank');
          writeAuthAttempted(props.server.url, true);
          setAttempted(true);
        },
        onError: () => {
          writeAuthAttempted(props.server.url, true);
          setAttempted(true);
          toast.failure('Failed to start authorization');
        },
      }
    );
  };

  const handleAuth = async () => {
    if (nangoBusy()) return;
    if (!mcpUrlSupportsNango(props.server.url)) {
      legacyAuth();
      return;
    }
    setNangoBusy(true);
    try {
      const outcome = await connectMcpServerViaNango({
        serverUrl: props.server.url,
        serverName: props.server.server_name,
      });
      if (outcome === 'unsupported') {
        legacyAuth();
      } else if (outcome === 'connected') {
        writeAuthAttempted(props.server.url, false);
        setAttempted(false);
        toast.success(`${props.server.server_name} connected`);
      }
    } catch {
      writeAuthAttempted(props.server.url, true);
      setAttempted(true);
      toast.failure('Failed to connect');
    } finally {
      setNangoBusy(false);
    }
  };

  const Icon = (): SvgIcon =>
    QUICK_CONNECT_ICON_MAP.get(props.server.url) ?? (PlugIcon as SvgIcon);

  return (
    <IntegrationRow
      icon={(() => {
        const C = Icon();
        return <C class="size-5" />;
      })()}
      title={
        <span class="flex items-center gap-1.5">
          <span class="min-w-0 truncate">{props.server.server_name}</span>
          <Show when={props.server.authenticated}>
            <CheckIcon class="size-3 shrink-0 text-success" />
          </Show>
          <Show when={connectionFailed()}>
            <XIcon class="size-3 shrink-0 text-failure" />
          </Show>
        </span>
      }
      description={hostFromUrl(props.server.url)}
    >
      <Show when={!props.server.authenticated}>
        <Show when={connectionFailed()}>
          <span class="text-xs text-failure whitespace-nowrap">
            Last attempt failed
          </span>
        </Show>
        <Button
          variant="active"
          size="sm"
          depth={3}
          disabled={authMutation.isPending || nangoBusy()}
          onClick={handleAuth}
        >
          {authMutation.isPending || nangoBusy()
            ? 'Connecting...'
            : connectionFailed()
              ? 'Try Again'
              : 'Connect'}
        </Button>
      </Show>

      <Show when={props.server.authenticated}>
        <ToggleSwitch
          size="md"
          checked={props.server.enabled}
          disabled={updateMutation.isPending}
          onChange={handleToggleEnabled}
          label={props.server.enabled ? 'Enabled' : 'Disabled'}
          labelClass="inline-block w-14 text-left text-xs text-ink-muted whitespace-nowrap"
        />
      </Show>

      <Show
        when={!confirmDelete()}
        fallback={
          <div class="flex items-center gap-1">
            <Button
              variant="danger"
              size="sm"
              depth={3}
              disabled={deleteMutation.isPending}
              onClick={handleDelete}
            >
              {deleteMutation.isPending ? 'Removing...' : 'Confirm'}
            </Button>
            <Button
              variant="base"
              size="sm"
              depth={3}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </div>
        }
      >
        <Button
          variant="base"
          size="sm"
          depth={3}
          tooltip="Remove"
          onClick={() => setConfirmDelete(true)}
        >
          <XIcon class="size-4" />
        </Button>
      </Show>
    </IntegrationRow>
  );
}

/**
 * A connectable server from the catalog the user hasn't connected yet, shown
 * inline in the integrations list to make connecting a one-click affair.
 * Once connected, the server shows up as a regular {@link ServerRow} instead.
 */
function CatalogRow(props: { entry: CatalogEntryResponse }) {
  const addMutation = useAddMcpServerMutation();
  const authMutation = useStartMcpAuthMutation();
  const [nangoBusy, setNangoBusy] = createSignal(false);

  // Once the add lands, the cache update removes this suggestion row from the
  // list. mutate()-level callbacks are dropped for unmounted observers, so the
  // add → auth chain must run on mutateAsync promises instead.
  const legacyConnect = async () => {
    try {
      await addMutation.mutateAsync({
        server_name: props.entry.display_name,
        url: props.entry.url,
      });
    } catch {
      toast.failure(`Failed to add ${props.entry.display_name}`);
      return;
    }
    try {
      const result: StartAuthResponse = await authMutation.mutateAsync({
        server_name: props.entry.display_name,
        server_url: props.entry.url,
      });
      window.open(result.authorization_url, '_blank');
    } catch {
      toast.failure('Server added but failed to start authorization');
    }
  };

  const handleConnect = async () => {
    if (nangoBusy()) return;
    if (!mcpUrlSupportsNango(props.entry.url)) {
      await legacyConnect();
      return;
    }
    setNangoBusy(true);
    try {
      const outcome = await connectMcpServerViaNango({
        serverUrl: props.entry.url,
        serverName: props.entry.display_name,
      });
      if (outcome === 'unsupported') {
        await legacyConnect();
      } else if (outcome === 'connected') {
        toast.success(`${props.entry.display_name} connected`);
      }
    } catch {
      toast.failure(`Failed to connect ${props.entry.display_name}`);
    } finally {
      setNangoBusy(false);
    }
  };

  return (
    <IntegrationRow
      icon={<CatalogIcon entry={props.entry} />}
      title={props.entry.display_name}
      description={props.entry.description ?? hostFromUrl(props.entry.url)}
    >
      <ConnectAction
        label="Connect"
        onClick={handleConnect}
        loading={addMutation.isPending || authMutation.isPending || nangoBusy()}
      />
    </IntegrationRow>
  );
}

/**
 * Connector icon: our bundled SVG for the servers we ship icons for, the
 * registry-provided icon otherwise, and a generic plug as the fallback.
 */
function CatalogIcon(props: { entry: CatalogEntryResponse }) {
  const BundledIcon = () => QUICK_CONNECT_ICON_MAP.get(props.entry.url);
  return (
    <Show
      when={BundledIcon()}
      fallback={
        <Show
          when={props.entry.icon_url}
          fallback={<PlugIcon class="size-5" />}
        >
          {(iconUrl) => (
            <img
              src={iconUrl()}
              alt=""
              loading="lazy"
              class="size-5 rounded object-contain"
            />
          )}
        </Show>
      }
    >
      {(Icon) => {
        const C = Icon();
        return <C class="size-5" />;
      }}
    </Show>
  );
}

/**
 * Featured connectors as catalog entries, for when the catalog API is
 * unavailable (or still loading): the same curated list the backend pins,
 * derived from the bundled presets so the section never renders empty.
 */
const FALLBACK_FEATURED: CatalogEntryResponse[] = FEATURED_MCP_SERVERS.map(
  (server) => ({
    name: server.server_name,
    display_name: server.server_name,
    description: server.tagline,
    url: server.url,
    icon_url: null,
    priority: true,
  })
);

/**
 * The "MCP integrations" section of the Connections page: MCP servers the
 * user has connected, then the curated featured connectors they haven't,
 * then a searchable catalog of every connectable server from the public MCP
 * registry — with custom servers behind the "Add server" dialog.
 */
export function IntegrationsSection() {
  const serversQuery = useMcpServersQuery();
  const [showAddDialog, setShowAddDialog] = createSignal(false);

  const [searchInput, setSearchInput] = createSignal('');
  const [search, setSearch] = createSignal('');
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const onSearchInput = (value: string) => {
    setSearchInput(value);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setSearch(value), 250);
  };
  onCleanup(() => clearTimeout(debounceTimer));

  const catalogQuery = useMcpCatalogQuery(search);
  // Separate un-searched instance backing the featured section, so it stays
  // put while the user types in the catalog search below. Same cache entry
  // as browsing with an empty search, so this costs no extra request.
  const featuredQuery = useMcpCatalogQuery(() => '');

  const servers = () => serversQuery.data ?? [];
  const existingUrls = () => new Set(servers().map((s) => s.url));

  const offered = (entry: CatalogEntryResponse) =>
    mcpUrlAvailableInEnv(entry.url) && !existingUrls().has(entry.url);

  const catalogEntries = () =>
    (catalogQuery.data?.pages ?? [])
      .flatMap((page) => page.servers)
      .filter(offered);

  // The featured section always shows the full curated list, served from the
  // presets bundled with the app until the catalog answers — the backend
  // pins the same list, so nothing jumps when it does.
  const featured = () => {
    const entries = (featuredQuery.data?.pages ?? [])
      .flatMap((page) => page.servers)
      .filter((entry) => entry.priority)
      .filter(offered);
    return entries.length > 0 ? entries : FALLBACK_FEATURED.filter(offered);
  };

  // Searching shows every match, with featured connectors ranked first by
  // the backend (flagged `priority`); browsing shows only organic registry
  // results, since the full featured list already sits above.
  const browseResults = () =>
    search().trim()
      ? catalogEntries()
      : catalogEntries().filter((entry) => !entry.priority);

  return (
    <SettingsSection
      title="MCP integrations"
      description="Connect MCP servers to give Macro's agent access to the tools your team already uses."
      actions={
        <Button
          variant="base"
          size="sm"
          depth={3}
          onClick={() => setShowAddDialog(true)}
        >
          <PlusIcon class="size-4" />
          Add server
        </Button>
      }
    >
      <Show when={serversQuery.isError}>
        <SettingsCard>
          <div class="px-6 py-8 text-center text-sm text-ink-muted">
            Failed to load integrations.
            <Button
              variant="base"
              size="sm"
              depth={3}
              onClick={() => serversQuery.refetch()}
              class="ml-2"
            >
              Retry
            </Button>
          </div>
        </SettingsCard>
      </Show>

      <Show when={!serversQuery.isError}>
        <SettingsCard>
          <For each={servers()}>
            {(server) => <ServerRow server={server} />}
          </For>
          <For each={featured()}>{(entry) => <CatalogRow entry={entry} />}</For>
        </SettingsCard>
      </Show>

      <SettingsCard>
        <div class="px-4 py-3">
          <input
            type="search"
            class="settings-input w-full"
            placeholder="Search all connectors..."
            value={searchInput()}
            onInput={(e) => onSearchInput(e.currentTarget.value)}
          />
        </div>

        <Show when={catalogQuery.isError}>
          <div class="px-6 py-6 text-center text-sm text-ink-muted">
            Couldn't load the connector catalog.
            <Button
              variant="base"
              size="sm"
              depth={3}
              onClick={() => catalogQuery.refetch()}
              class="ml-2"
            >
              Retry
            </Button>
          </div>
        </Show>

        <Show when={!catalogQuery.isError}>
          <For each={browseResults()}>
            {(entry) => <CatalogRow entry={entry} />}
          </For>

          <Show when={catalogQuery.isFetching && browseResults().length === 0}>
            <div class="px-6 py-6 text-center text-sm text-ink-muted">
              Loading connectors...
            </div>
          </Show>

          <Show
            when={
              !catalogQuery.isFetching &&
              browseResults().length === 0 &&
              search().trim()
            }
          >
            <div class="px-6 py-6 text-center text-sm text-ink-muted">
              No connectors found for "{search().trim()}". You can still add one
              by URL with "Add server".
            </div>
          </Show>

          <Show when={catalogQuery.hasNextPage}>
            <div class="px-4 py-3 text-center">
              <Button
                variant="base"
                size="sm"
                depth={3}
                disabled={catalogQuery.isFetchingNextPage}
                onClick={() => void catalogQuery.fetchNextPage()}
              >
                {catalogQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          </Show>
        </Show>
      </SettingsCard>

      <AddServerForm open={showAddDialog()} onOpenChange={setShowAddDialog} />
    </SettingsSection>
  );
}
