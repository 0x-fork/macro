import GoogleDriveIcon from '@icon/mcp-google-drive.svg';
import { toast } from '@core/component/Toast/Toast';
import {
  useGoogleDriveFoldersQuery,
  useImportFromGoogleDrive,
} from '@queries/drive';
import type { DriveFile } from '@service-storage/client';
import { Button, Checkbox, Dialog } from '@ui';
import { For, Show, createSignal } from 'solid-js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * A folder navigator for importing Drive content into Macro. The user drills
 * into folders (breadcrumb to navigate back) and checks the files/folders to
 * import; selecting a folder imports it recursively. Mirrors the
 * `MoveToProjectView` flat-list pattern but browses one Drive folder at a time.
 */
export function GoogleDriveImportDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // `null` = the user's Drive root.
  const [parentId, setParentId] = createSignal<string | null>(null);
  const [breadcrumb, setBreadcrumb] = createSignal<
    { id: string; name: string }[]
  >([]);
  // Drive id -> name, for the items the user has selected to import.
  const [selected, setSelected] = createSignal<Record<string, string>>({});

  const foldersQuery = useGoogleDriveFoldersQuery(parentId, () => props.open);
  const importMutation = useImportFromGoogleDrive();

  const isFolder = (file: DriveFile) => file.mimeType === FOLDER_MIME;
  const selectedCount = () => Object.keys(selected()).length;

  const toggle = (file: DriveFile) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[file.id]) {
        delete next[file.id];
      } else {
        next[file.id] = file.name;
      }
      return next;
    });
  };

  const openFolder = (file: DriveFile) => {
    setBreadcrumb((crumbs) => [...crumbs, { id: file.id, name: file.name }]);
    setParentId(file.id);
  };

  // index === -1 navigates back to the root.
  const navigateTo = (index: number) => {
    if (index < 0) {
      setBreadcrumb([]);
      setParentId(null);
      return;
    }
    const crumb = breadcrumb()[index];
    setBreadcrumb((crumbs) => crumbs.slice(0, index + 1));
    setParentId(crumb.id);
  };

  const reset = () => {
    setParentId(null);
    setBreadcrumb([]);
    setSelected({});
  };

  const handleImport = async () => {
    const items = Object.keys(selected()).map((driveId) => ({ driveId }));
    if (items.length === 0) {
      return;
    }
    try {
      const result = await importMutation.mutateAsync({ items });
      const count = result.imported.length;
      toast.success(
        `Imported ${count} item${count === 1 ? '' : 's'} from Google Drive`
      );
      reset();
      props.onOpenChange(false);
    } catch {
      toast.failure('Failed to import from Google Drive');
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <div class="flex w-[28rem] max-w-full flex-col gap-3">
        <div class="flex items-center gap-2">
          <GoogleDriveIcon class="size-5" />
          <Dialog.Title class="text-base font-medium">
            Import from Google Drive
          </Dialog.Title>
        </div>

        <div class="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
          <button
            type="button"
            class="hover:underline"
            onClick={() => navigateTo(-1)}
          >
            My Drive
          </button>
          <For each={breadcrumb()}>
            {(crumb, index) => (
              <>
                <span>/</span>
                <button
                  type="button"
                  class="hover:underline"
                  onClick={() => navigateTo(index())}
                >
                  {crumb.name}
                </button>
              </>
            )}
          </For>
        </div>

        <div class="h-72 overflow-y-auto rounded border border-edge-muted">
          <Show
            when={!foldersQuery.isLoading}
            fallback={<div class="p-3 text-sm text-ink-muted">Loading…</div>}
          >
            <Show
              when={(foldersQuery.data?.files.length ?? 0) > 0}
              fallback={
                <div class="p-3 text-sm text-ink-muted">
                  This folder is empty.
                </div>
              }
            >
              <For each={foldersQuery.data?.files}>
                {(file) => (
                  <div class="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-hover">
                    <Checkbox
                      checked={!!selected()[file.id]}
                      onChange={() => toggle(file)}
                    >
                      <Checkbox.Control />
                    </Checkbox>
                    <Show
                      when={isFolder(file)}
                      fallback={
                        <span class="flex-1 truncate text-sm">{file.name}</span>
                      }
                    >
                      <button
                        type="button"
                        class="flex-1 truncate text-left text-sm hover:underline"
                        onClick={() => openFolder(file)}
                      >
                        {file.name}/
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-sm text-ink-muted">{selectedCount()} selected</span>
          <div class="flex items-center gap-2">
            <Button
              variant="base"
              size="sm"
              depth={3}
              onClick={() => props.onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="base"
              size="sm"
              depth={3}
              disabled={selectedCount() === 0 || importMutation.isPending}
              onClick={handleImport}
            >
              {importMutation.isPending ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
