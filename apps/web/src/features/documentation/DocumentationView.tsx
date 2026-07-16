/**
 * Documentation: teams build public docs sites from their markdown
 * documents. A site is a curated nav tree (groups + pages, each page backed
 * by a Macro doc, edited with the normal editor); Publish renders it to a
 * static website served from the docs-sites CDN.
 *
 * Gating layers (outermost first): PostHog rollout flag (handled by the
 * component registry / sidebar), team membership, team plan, and the
 * team-level Documentation toggle from Settings.
 */

import { useSplitLayout } from '@app/components/app/split-layout/layout';
import { toast } from '@core/component/Toast/Toast';
import { fileTypeToBlockName } from '@core/constant/allBlocks';
import { useSettingsState } from '@core/constant/SettingsState';
import EmptyStateDoc from '@design/empty-state-doc.svg';
import ArrowDownIcon from '@phosphor/arrow-down.svg';
import ArrowSquareOutIcon from '@phosphor/arrow-square-out.svg';
import ArrowUpIcon from '@phosphor/arrow-up.svg';
import GlobeIcon from '@phosphor/globe.svg';
import PlusIcon from '@phosphor/plus.svg';
import SpinnerIcon from '@phosphor/spinner.svg';
import TrashIcon from '@phosphor/trash.svg';
import XIcon from '@phosphor/x.svg';
import {
  type CreateNavNodeRequest,
  useCreateDocumentationNavNodeMutation,
  useCreateDocumentationSiteMutation,
  useCreatePageDocumentMutation,
  useDeleteDocumentationNavNodeMutation,
  useDeleteDocumentationSiteMutation,
  useDocumentationAvailabilityQuery,
  useDocumentationSiteQuery,
  useDocumentationSitesQuery,
  useMoveDocumentationNavNodeMutation,
  usePublishDocumentationSiteMutation,
  useSetDocumentationCustomDomainMutation,
} from '@queries/documentation/sites';
import { useCurrentTeamQuery, useIsTeamAdmin } from '@queries/team/teams';
import type { NavTreeNode } from '@service-storage/generated/schemas/navTreeNode';
import { Button, Dialog, EmptyStatePanel, Panel, Tooltip } from '@ui';
import {
  createMemo,
  createSignal,
  For,
  type JSX,
  Show,
  Suspense,
} from 'solid-js';

/* ------------------------------------------------------------------ */
/* Shared bits                                                        */
/* ------------------------------------------------------------------ */

function FormDialog(props: {
  open: boolean;
  title: string;
  submitLabel: string;
  pending?: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: JSX.Element;
}) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <Panel depth={2} class="max-h-[75vh] w-96 text-ink rounded-xl">
        <Panel.Header class="px-2 gap-1">
          <Dialog.CloseButton as={Button} variant="ghost" size="icon-sm">
            <XIcon />
          </Dialog.CloseButton>
          <Dialog.Title as="span" class="text-sm font-medium p-0 m-0">
            {props.title}
          </Dialog.Title>
        </Panel.Header>
        <Panel.Body class="p-3 flex flex-col gap-3">
          {props.children}
          <div class="flex justify-end gap-1 pt-2">
            <Button
              variant="ghost"
              class="rounded-xs"
              disabled={props.pending}
              onClick={props.onClose}
            >
              Cancel
            </Button>
            <Button
              variant="active"
              class="rounded-xs"
              disabled={props.pending || props.submitDisabled}
              onClick={props.onSubmit}
            >
              <Show when={props.pending} fallback={props.submitLabel}>
                <SpinnerIcon class="size-4 animate-spin" />
              </Show>
            </Button>
          </div>
        </Panel.Body>
      </Panel>
    </Dialog>
  );
}

function TextField(props: {
  label: string;
  value: string;
  placeholder?: string;
  onInput: (value: string) => void;
}) {
  return (
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-ink-muted">{props.label}</span>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        class="w-full px-3 py-2 text-sm border border-edge-muted rounded-lg bg-surface text-ink placeholder:text-ink/30 outline-none focus:border-accent"
      />
    </label>
  );
}

/** Extracts a document id from a pasted Macro doc link or a bare uuid. */
function parseDocumentId(input: string): string | null {
  const uuid =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(
      input.trim()
    );
  return uuid ? uuid[0] : null;
}

/* ------------------------------------------------------------------ */
/* Gating states                                                      */
/* ------------------------------------------------------------------ */

function GatePanel(props: {
  title: string;
  description: JSX.Element;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div class="flex size-full items-center justify-center">
      <EmptyStatePanel
        graphic={EmptyStateDoc}
        title={props.title}
        description={props.description}
        primaryAction={props.action}
        centered
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Site list                                                          */
/* ------------------------------------------------------------------ */

function CreateSiteDialog(props: { open: boolean; onClose: () => void }) {
  const createSite = useCreateDocumentationSiteMutation();
  const [name, setName] = createSignal('');

  const handleSubmit = () => {
    createSite.mutate(
      { name: name().trim() },
      {
        onSuccess: () => {
          setName('');
          props.onClose();
          toast.success('Site created');
        },
        onError: (error: Error) => {
          console.error('Failed to create documentation site', error);
          toast.failure('Failed to create site');
        },
      }
    );
  };

  return (
    <FormDialog
      open={props.open}
      title="New documentation site"
      submitLabel="Create site"
      pending={createSite.isPending}
      submitDisabled={name().trim().length === 0}
      onSubmit={handleSubmit}
      onClose={props.onClose}
    >
      <TextField
        label="Site name"
        value={name()}
        placeholder="Product Docs"
        onInput={setName}
      />
      <p class="text-xs text-ink-muted">
        The public URL is derived from the name; you can change both later.
      </p>
    </FormDialog>
  );
}

function SiteList(props: { onOpenSite: (siteId: string) => void }) {
  const sitesQuery = useDocumentationSitesQuery(() => true);
  const [showCreate, setShowCreate] = createSignal(false);

  return (
    <>
      <Show
        when={(sitesQuery.data?.length ?? 0) > 0}
        fallback={
          <Show when={sitesQuery.isSuccess}>
            <GatePanel
              title="Build your documentation"
              description="Write docs as regular Macro documents, arrange them into a site, and publish a fast public docs website."
              action={{
                label: 'Create your first site',
                onClick: () => setShowCreate(true),
              }}
            />
          </Show>
        }
      >
        <div class="mx-auto flex w-full max-w-2xl flex-col gap-3 p-6">
          <div class="flex items-center justify-between">
            <h1 class="text-lg font-medium">Documentation</h1>
            <Button
              variant="active"
              size="sm"
              class="rounded-xs"
              onClick={() => setShowCreate(true)}
            >
              <PlusIcon class="size-4" /> New site
            </Button>
          </div>
          <For each={sitesQuery.data}>
            {(site) => (
              <button
                type="button"
                class="flex items-center justify-between rounded-lg border border-edge-muted bg-surface px-4 py-3 text-left hover:border-accent"
                onClick={() => props.onOpenSite(site.id)}
              >
                <div class="flex flex-col">
                  <span class="font-medium">{site.name}</span>
                  <span class="text-xs text-ink-muted">{site.public_url}</span>
                </div>
                <span class="text-xs text-ink-muted">
                  {site.published_at
                    ? `Published ${new Date(site.published_at).toLocaleDateString()}`
                    : 'Not published yet'}
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
      <CreateSiteDialog
        open={showCreate()}
        onClose={() => setShowCreate(false)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Nav tree editor                                                    */
/* ------------------------------------------------------------------ */

function AddPageDialog(props: {
  open: boolean;
  siteId: string;
  parentId: string | null;
  onClose: () => void;
}) {
  const createDocument = useCreatePageDocumentMutation();
  const createNode = useCreateDocumentationNavNodeMutation();
  const [title, setTitle] = createSignal('');
  const [existingDoc, setExistingDoc] = createSignal('');

  const pending = () => createDocument.isPending || createNode.isPending;

  const addNode = (documentId: string) => {
    const body: CreateNavNodeRequest = {
      kind: 'page',
      title: title().trim(),
      document_id: documentId,
      ...(props.parentId ? { parent_id: props.parentId } : {}),
    };
    createNode.mutate(
      { siteId: props.siteId, body },
      {
        onSuccess: () => {
          setTitle('');
          setExistingDoc('');
          props.onClose();
        },
        onError: (error: Error) => {
          console.error('Failed to add page', error);
          toast.failure('Failed to add page');
        },
      }
    );
  };

  const handleSubmit = () => {
    const pasted = existingDoc().trim();
    if (pasted.length > 0) {
      const documentId = parseDocumentId(pasted);
      if (!documentId) {
        toast.failure('Could not find a document id in the link');
        return;
      }
      addNode(documentId);
      return;
    }
    // No existing doc given: create a fresh markdown document to back the
    // page, then hang the nav node off it.
    createDocument.mutate(
      { title: title().trim() },
      {
        onSuccess: (response) => addNode(response.documentId),
        onError: (error: Error) => {
          console.error('Failed to create page document', error);
          toast.failure('Failed to create the page document');
        },
      }
    );
  };

  return (
    <FormDialog
      open={props.open}
      title="Add page"
      submitLabel="Add page"
      pending={pending()}
      submitDisabled={title().trim().length === 0}
      onSubmit={handleSubmit}
      onClose={props.onClose}
    >
      <TextField
        label="Page title"
        value={title()}
        placeholder="Getting Started"
        onInput={setTitle}
      />
      <TextField
        label="Existing document (optional)"
        value={existingDoc()}
        placeholder="Paste a doc link to use an existing document"
        onInput={setExistingDoc}
      />
      <p class="text-xs text-ink-muted">
        Leave the document field empty to create a fresh doc for this page.
      </p>
    </FormDialog>
  );
}

function AddGroupDialog(props: {
  open: boolean;
  siteId: string;
  onClose: () => void;
}) {
  const createNode = useCreateDocumentationNavNodeMutation();
  const [title, setTitle] = createSignal('');

  const handleSubmit = () => {
    createNode.mutate(
      { siteId: props.siteId, body: { kind: 'group', title: title().trim() } },
      {
        onSuccess: () => {
          setTitle('');
          props.onClose();
        },
        onError: (error: Error) => {
          console.error('Failed to add group', error);
          toast.failure('Failed to add group');
        },
      }
    );
  };

  return (
    <FormDialog
      open={props.open}
      title="Add group"
      submitLabel="Add group"
      pending={createNode.isPending}
      submitDisabled={title().trim().length === 0}
      onSubmit={handleSubmit}
      onClose={props.onClose}
    >
      <TextField
        label="Group title"
        value={title()}
        placeholder="Key Concepts"
        onInput={setTitle}
      />
    </FormDialog>
  );
}

function NavNodeRow(props: {
  siteId: string;
  node: NavTreeNode;
  index: number;
  siblingCount: number;
  depth: number;
  onAddPageToGroup: (groupId: string) => void;
}) {
  const { insertSplit } = useSplitLayout();
  const moveNode = useMoveDocumentationNavNodeMutation();
  const deleteNode = useDeleteDocumentationNavNodeMutation();

  const move = (delta: number) => {
    moveNode.mutate({
      siteId: props.siteId,
      nodeId: props.node.id,
      parentId: props.node.parent_id ?? null,
      position: Math.max(0, props.node.position + delta),
    });
  };

  const openDocument = () => {
    const documentId = props.node.document_id;
    if (!documentId) return;
    insertSplit({ type: fileTypeToBlockName('md'), id: documentId });
  };

  return (
    <>
      <div
        class="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-raised"
        style={{ 'padding-left': `${8 + props.depth * 20}px` }}
      >
        <Show
          when={props.node.kind === 'page'}
          fallback={
            <span class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {props.node.title}
            </span>
          }
        >
          <button
            type="button"
            class="flex min-w-0 items-center gap-2 text-left text-sm hover:text-accent"
            onClick={openDocument}
            title="Open the backing document"
          >
            <span class="truncate">{props.node.title}</span>
            <span class="truncate text-xs text-ink-muted">
              /{props.node.path}
            </span>
          </button>
        </Show>

        <div class="ml-auto hidden items-center gap-1 group-hover:flex">
          <Show when={props.node.kind === 'group'}>
            <Tooltip label="Add page to group">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => props.onAddPageToGroup(props.node.id)}
              >
                <PlusIcon class="size-3.5" />
              </Button>
            </Tooltip>
          </Show>
          <Tooltip label="Move up">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={props.index === 0 || moveNode.isPending}
              onClick={() => move(-1)}
            >
              <ArrowUpIcon class="size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip label="Move down">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={
                props.index >= props.siblingCount - 1 || moveNode.isPending
              }
              onClick={() => move(1)}
            >
              <ArrowDownIcon class="size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip
            label={
              props.node.kind === 'group'
                ? 'Remove group and its pages from the site'
                : 'Remove page from the site (keeps the document)'
            }
          >
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={deleteNode.isPending}
              onClick={() =>
                deleteNode.mutate({
                  siteId: props.siteId,
                  nodeId: props.node.id,
                })
              }
            >
              <TrashIcon class="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>
      <For each={props.node.children}>
        {(child, index) => (
          <NavNodeRow
            siteId={props.siteId}
            node={child}
            index={index()}
            siblingCount={props.node.children.length}
            depth={props.depth + 1}
            onAddPageToGroup={props.onAddPageToGroup}
          />
        )}
      </For>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Site editor                                                        */
/* ------------------------------------------------------------------ */

function SiteEditor(props: { siteId: string; onBack: () => void }) {
  const isTeamAdmin = useIsTeamAdmin();
  const siteQuery = useDocumentationSiteQuery(() => props.siteId);
  const publish = usePublishDocumentationSiteMutation();
  const deleteSite = useDeleteDocumentationSiteMutation();
  const setDomain = useSetDocumentationCustomDomainMutation();

  const [addPageParent, setAddPageParent] = createSignal<string | null>(null);
  const [showAddPage, setShowAddPage] = createSignal(false);
  const [showAddGroup, setShowAddGroup] = createSignal(false);
  const [showDomainDialog, setShowDomainDialog] = createSignal(false);
  const [domainInput, setDomainInput] = createSignal('');
  const [showDeleteDialog, setShowDeleteDialog] = createSignal(false);

  const buildStatus = () => siteQuery.data?.latest_build?.status;
  const buildRunning = () =>
    buildStatus() === 'pending' || buildStatus() === 'in_progress';
  const pageCount = createMemo(() => {
    const count = (nodes: NavTreeNode[]): number =>
      nodes.reduce(
        (total, node) =>
          total + (node.kind === 'page' ? 1 : 0) + count(node.children),
        0
      );
    return count(siteQuery.data?.nav ?? []);
  });

  const handlePublish = () => {
    publish.mutate(
      { siteId: props.siteId },
      {
        onSuccess: () => toast.success('Publishing started'),
        onError: (error: Error) => {
          console.error('Failed to publish site', error);
          toast.failure('Failed to start publishing');
        },
      }
    );
  };

  const handleAddPageToGroup = (groupId: string) => {
    setAddPageParent(groupId);
    setShowAddPage(true);
  };

  return (
    <Show when={siteQuery.data}>
      {(site) => (
        <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              class="rounded-xs"
              onClick={props.onBack}
            >
              ← All sites
            </Button>
          </div>

          <div class="flex items-start justify-between gap-4">
            <div class="flex min-w-0 flex-col gap-1">
              <h1 class="truncate text-lg font-medium">{site().name}</h1>
              <a
                href={site().public_url}
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-1 text-xs text-ink-muted hover:text-accent"
              >
                <GlobeIcon class="size-3.5" />
                {site().public_url}
                <ArrowSquareOutIcon class="size-3" />
              </a>
              <Show when={site().custom_domain}>
                <span class="text-xs text-ink-muted">
                  Custom domain: {site().custom_domain}
                </span>
              </Show>
            </div>
            <div class="flex items-center gap-2">
              <Show when={buildRunning()}>
                <span class="flex items-center gap-1 text-xs text-ink-muted">
                  <SpinnerIcon class="size-3.5 animate-spin" /> Publishing…
                </span>
              </Show>
              <Show when={buildStatus() === 'failed'}>
                <Tooltip
                  label={
                    siteQuery.data?.latest_build?.error ?? 'Publish failed'
                  }
                >
                  <span class="text-xs text-error">Last publish failed</span>
                </Tooltip>
              </Show>
              <Button
                variant="active"
                size="sm"
                class="rounded-xs"
                disabled={
                  publish.isPending || buildRunning() || pageCount() === 0
                }
                onClick={handlePublish}
              >
                Publish
              </Button>
            </div>
          </div>

          <div class="flex items-center justify-between border-b border-edge-muted pb-2">
            <span class="text-sm font-medium">
              Pages <span class="text-ink-muted">({pageCount()})</span>
            </span>
            <div class="flex gap-1">
              <Button
                variant="base"
                size="sm"
                class="rounded-xs"
                onClick={() => setShowAddGroup(true)}
              >
                <PlusIcon class="size-3.5" /> Group
              </Button>
              <Button
                variant="active"
                size="sm"
                class="rounded-xs"
                onClick={() => {
                  setAddPageParent(null);
                  setShowAddPage(true);
                }}
              >
                <PlusIcon class="size-3.5" /> Page
              </Button>
            </div>
          </div>

          <Show
            when={(siteQuery.data?.nav.length ?? 0) > 0}
            fallback={
              <p class="py-6 text-center text-sm text-ink-muted">
                Add your first page. The first page in the list becomes the
                site's landing page.
              </p>
            }
          >
            <div class="flex flex-col">
              <For each={siteQuery.data?.nav}>
                {(node, index) => (
                  <NavNodeRow
                    siteId={props.siteId}
                    node={node}
                    index={index()}
                    siblingCount={siteQuery.data?.nav.length ?? 0}
                    depth={0}
                    onAddPageToGroup={handleAddPageToGroup}
                  />
                )}
              </For>
            </div>
          </Show>

          <Show when={isTeamAdmin()}>
            <div class="mt-6 flex items-center gap-2 border-t border-edge-muted pt-4">
              <Button
                variant="base"
                size="sm"
                class="rounded-xs"
                onClick={() => {
                  setDomainInput(site().custom_domain ?? '');
                  setShowDomainDialog(true);
                }}
              >
                Custom domain
              </Button>
              <Button
                variant="danger"
                size="sm"
                class="rounded-xs"
                onClick={() => setShowDeleteDialog(true)}
              >
                Delete site
              </Button>
            </div>
          </Show>

          <AddPageDialog
            open={showAddPage()}
            siteId={props.siteId}
            parentId={addPageParent()}
            onClose={() => setShowAddPage(false)}
          />
          <AddGroupDialog
            open={showAddGroup()}
            siteId={props.siteId}
            onClose={() => setShowAddGroup(false)}
          />

          <FormDialog
            open={showDomainDialog()}
            title="Custom domain"
            submitLabel="Save"
            pending={setDomain.isPending}
            onSubmit={() => {
              const domain = domainInput().trim();
              setDomain.mutate(
                {
                  siteId: props.siteId,
                  customDomain: domain.length > 0 ? domain : null,
                },
                {
                  onSuccess: () => setShowDomainDialog(false),
                  onError: (error: Error) => {
                    console.error('Failed to set custom domain', error);
                    toast.failure('Failed to set custom domain');
                  },
                }
              );
            }}
            onClose={() => setShowDomainDialog(false)}
          >
            <TextField
              label="Domain"
              value={domainInput()}
              placeholder="docs.example.com"
              onInput={setDomainInput}
            />
            <p class="text-xs text-ink-muted">
              Point the domain's DNS at the Macro docs CDN to serve the site
              from it. Leave empty to remove the custom domain.
            </p>
          </FormDialog>

          <FormDialog
            open={showDeleteDialog()}
            title="Delete site"
            submitLabel="Delete site"
            pending={deleteSite.isPending}
            onSubmit={() =>
              deleteSite.mutate(
                { siteId: props.siteId },
                {
                  onSuccess: () => {
                    setShowDeleteDialog(false);
                    toast.success('Site deleted');
                    props.onBack();
                  },
                  onError: (error: Error) => {
                    console.error('Failed to delete site', error);
                    toast.failure('Failed to delete site');
                  },
                }
              )
            }
            onClose={() => setShowDeleteDialog(false)}
          >
            <p class="text-sm">
              Deleting the site takes down its published website. The backing
              documents are not deleted.
            </p>
          </FormDialog>
        </div>
      )}
    </Show>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                               */
/* ------------------------------------------------------------------ */

function DocumentationContent() {
  const teamQuery = useCurrentTeamQuery();
  const isTeamAdmin = useIsTeamAdmin();
  const { openSettings } = useSettingsState();
  const hasTeam = createMemo(() => !!teamQuery.data?.team);
  const availabilityQuery = useDocumentationAvailabilityQuery(hasTeam);
  const [selectedSiteId, setSelectedSiteId] = createSignal<string | null>(null);

  return (
    <Show
      when={hasTeam()}
      fallback={
        <Show when={teamQuery.isSuccess}>
          <GatePanel
            title="Documentation is built for teams"
            description="Create or join a team to build a documentation site together."
          />
        </Show>
      }
    >
      <Show when={availabilityQuery.data}>
        {(availability) => (
          <Show
            when={availability().plan_ok}
            fallback={
              <GatePanel
                title="Documentation requires a team plan"
                description="Publishing product documentation is available on team plans. Upgrade your team to get started."
              />
            }
          >
            <Show
              when={availability().enabled}
              fallback={
                <GatePanel
                  title="Documentation is turned off for your team"
                  description={
                    isTeamAdmin()
                      ? 'Enable Documentation in your team settings to start building your docs site.'
                      : 'Ask a team admin to enable Documentation in the team settings.'
                  }
                  action={
                    isTeamAdmin()
                      ? {
                          label: 'Open settings',
                          onClick: () => openSettings('Documentation'),
                        }
                      : undefined
                  }
                />
              }
            >
              <Show
                when={selectedSiteId()}
                fallback={<SiteList onOpenSite={setSelectedSiteId} />}
              >
                {(siteId) => (
                  <SiteEditor
                    siteId={siteId()}
                    onBack={() => setSelectedSiteId(null)}
                  />
                )}
              </Show>
            </Show>
          </Show>
        )}
      </Show>
    </Show>
  );
}

export default function DocumentationView() {
  return (
    <Suspense
      fallback={
        <div class="animate-pulse bg-ink-extra-muted rounded h-4 w-32 m-6" />
      }
    >
      <div class="size-full overflow-y-auto">
        <DocumentationContent />
      </div>
    </Suspense>
  );
}
