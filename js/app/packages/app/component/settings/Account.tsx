import { capitalize } from '@block-pdf/util/StringUtils';
import { useHasPaidAccess } from '@core/auth/license';
import { UserIcon } from '@core/component/UserIcon';
import { useLogout } from '@core/auth/logout';
import { isNativeMobilePlatform } from '@core/mobile/isNativeMobilePlatform';
import { toast } from '@core/component/Toast/Toast';
import { staticFileIdEndpoint } from '@core/constant/servers';
import { createStaticFile } from '@core/util/create';
import { Dialog, Button, Panel } from '@ui';
import {
  blockNameToFileExtensions,
  blockNameToMimeTypes,
} from '@core/constant/allBlocks';
import { ShowFeatureFlag } from '@app/lib/analytics/posthog';
import {
  DEV_MODE_ENV,
  ENABLE_AUTO_UPDATE_UI,
  ENABLE_EMAIL,
  ENABLE_PROFILE_PICTURES,
  ENABLE_NEW_PRICING_OVERRIDE,
} from '@core/constant/featureFlags';
import { useTauri, type BundleUpdateStatus } from '@macro/tauri';
import { invoke } from '@tauri-apps/api/core';
import { useUserTeamsQuery } from '@queries/team';
import { usePaywallState } from '@core/constant/PaywallState';
import { fileSelector } from '@core/directive/fileSelector';
import {
  type ProfilePictureItem,
  useProfilePictureUrl,
} from '@core/signal/profilePicture';
import IconUpload from '@phosphor-icons/core/regular/upload-simple.svg?component-solid';
import ArrowSquareOutIcon from '@phosphor/arrow-square-out.svg';
import WarningIcon from '@phosphor/warning.svg';
import { authServiceClient } from '@service-auth/client';
import { useEmail, useLicenseStatus, useUserId } from '@core/context/user';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  type JSX,
  Match,
  Show,
  Switch,
} from 'solid-js';
import { usePermissions } from '@core/context/user';
import PaywallComponent from '../paywall/PaywallComponent';
import { useEmailLinks, useEmailLinksStatus } from '@core/email-link';

// NOTE: solid directives
false && fileSelector;

// 16 megabytes
const MAX_PROFILE_PICTURE_SIZE = 16 * 1000 * 1000;

async function uploadProfilePicture(
  file: File
): Promise<{ id: string; url: string } | void> {
  if (file.size > MAX_PROFILE_PICTURE_SIZE) {
    return toast.failure('Image size too large');
  }

  try {
    const id = await createStaticFile(file);
    const url = staticFileIdEndpoint(id);
    await authServiceClient.putProfilePicture({ url });
    return { id, url };
  } catch (_error) {
    return toast.failure('Failed to upload profile picture');
  }
}

function useUserName() {
  const fetchUserName = async () => {
    const response = await authServiceClient.getUserName();
    return response.isOk() ? response.value : null;
  };

  const [userNameResource] = createResource(fetchUserName);

  const userName = createMemo(() => {
    if (userNameResource.loading) return undefined;
    return userNameResource() || undefined;
  });

  return userName;
}

// Not accessible if user is not authenticated
export function Account() {
  const email = useEmail();
  const userId = useUserId();
  const licenseStatus = useLicenseStatus();
  const logout = useLogout();
  const { showPaywall } = usePaywallState();
  const hasPaidAccess = useHasPaidAccess();
  const permissions = usePermissions();
  const [showEmailModal, setShowEmailModal] = createSignal<boolean>(false);
  const [showEnableEmailModal, setShowEnableEmailModal] = createSignal<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = createSignal<boolean>(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = createSignal<boolean>(false);

  const { disconnect: disconnectEmail } = useEmailLinks();

  const userTeamsQuery = useUserTeamsQuery();
  const ownedTeam = createMemo(() => {
    const teams = userTeamsQuery.data;
    const uid = userId();
    if (!teams || !uid) return undefined;
    return teams.find((t) => t.owner_id === uid);
  });
  const isNonOwnerTeamMember = createMemo(() => {
    const teams = userTeamsQuery.data;
    const uid = userId();
    if (!teams || !uid) return false;
    return teams.some((t) => t.owner_id !== uid);
  });

  const userName = useUserName();
  const [updatedFirstName, setUpdatedFirstName] = createSignal<
    string | undefined
  >(undefined);
  const [updatedLastName, setUpdatedLastName] = createSignal<
    string | undefined
  >(undefined);

  const emailActive = useEmailLinksStatus();

  const [githubLinkExists, { refetch: refetchGithubLink }] = createResource(async () => {
    const response = await authServiceClient.checkLinkExists({ idp_name: 'github' });
    return response.isOk() ? response.value.link_exists : false;
  });

  const handleGithubEnable = async () => {
    const url = await authServiceClient.initGithubLink(window.location.href);
    if (url.isOk()) {
      window.location.href = url.value;
    }
  };

  const handleGithubDisable = async () => {
    await authServiceClient.deleteGithubLink();
    refetchGithubLink();
  };

  const firstName = () => {
    // Display any updated first name immediately without having to refetch
    if (updatedFirstName() !== undefined) return updatedFirstName();
    const userNameValue = userName();
    if (userNameValue && userNameValue.first_name) {
      return userNameValue.first_name;
    }
    return undefined;
  };

  const lastName = () => {
    // Display any updated last name immediately without having to refetch
    if (updatedLastName() !== undefined) return updatedLastName();
    const userNameValue = userName();
    if (userNameValue && userNameValue.last_name) {
      return userNameValue.last_name;
    }
    return undefined;
  };

  const deleteAccountHandler = async () => {
    await authServiceClient.deleteUser();
    logout();
  };

  const displayName = () => {
    const full = [firstName(), lastName()].filter(Boolean).join(' ').trim();
    return full || email() || 'Account';
  };

  const profilePictureUpload = {
    acceptedFileExtensions: blockNameToFileExtensions.image,
    acceptedMimeTypes: blockNameToMimeTypes.image,
    onSelect: async (files: File[]) => {
      const response = await uploadProfilePicture(files[0]);
      const uid = userId();
      if (!response || !uid) return;
      const pic: ProfilePictureItem = {
        _createdAt: new Date(),
        url: response.url,
        id: uid,
        loading: false,
      };
      const [_, controls] = useProfilePictureUrl(uid);
      controls.mutate(pic);
    },
  };

  const handleClearProfilePicture = async () => {
    const uid = userId();
    if (!uid) return;
    await authServiceClient.putProfilePicture({ url: '' });
    const [_, controls] = useProfilePictureUrl(uid);
    controls.mutate({
      _createdAt: new Date(),
      id: uid,
      loading: false,
    });
  };

  const isTeamUser = () => !!ownedTeam() || isNonOwnerTeamMember();
  const planName = () => capitalize(licenseStatus() ?? '') || 'Active';
  const planDescription = () => {
    if (isTeamUser()) return 'Managed by your team';
    if (hasPaidAccess()) return `You're on the ${planName()} plan`;
    return 'Choose a plan to unlock all features';
  };

  return (
    <div class="flex w-full flex-col divide-y divide-edge-muted text-ink">
      <div>
      <div class="flex items-center gap-4 pt-6">
        <UserIcon
          id={userId() as string}
          isDeleted={false}
          size="lg"
          class="shrink-0"
        />
        <div class="flex min-w-0 flex-col gap-0.5">
          <div class="ph-no-capture truncate text-base font-semibold">
            {displayName()}
          </div>
          <div class="ph-no-capture truncate text-sm text-ink-muted">
            {email() ?? ''}
          </div>
        </div>
      </div>

      <div class="py-6">
        <Section title="Profile">
          <Show when={ENABLE_PROFILE_PICTURES && userId()}>
            <Row
              label="Profile picture"
              description="JPG or PNG up to 16MB"
            >
              <div class="flex items-center gap-3">
                <UserIcon
                  id={userId() as string}
                  isDeleted={false}
                  size="lg"
                  class="shrink-0"
                />
                <div class="flex gap-1">
                  <div use:fileSelector={profilePictureUpload} class="contents">
                    <Button variant="base" size="sm" depth={3}>
                      <IconUpload class="size-3.5" />
                      Upload
                    </Button>
                  </div>
                  <Button
                    variant="base"
                    size="sm"
                    depth={3}
                    onClick={handleClearProfilePicture}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </Row>
          </Show>
          <Row label="First name">
            <NameInput
              value={firstName()}
              onSave={(newValue) => {
                setUpdatedFirstName(newValue);
                authServiceClient.putUserName({ first_name: newValue });
              }}
              placeholder="Enter first name"
            />
          </Row>
          <Row label="Last name">
            <NameInput
              value={lastName()}
              onSave={(newValue) => {
                setUpdatedLastName(newValue);
                authServiceClient.putUserName({ last_name: newValue });
              }}
              placeholder="Enter last name"
            />
          </Row>
        </Section>
      </div>
      </div>

      <div class="py-6">
        <Section title="Subscription">
          <Row
            label="License"
            description={
              <span class="inline-flex items-center gap-1 text-alert-ink/70">
                <WarningIcon class="size-3" />
                Deprecated
              </span>
            }
          >
            <span class="text-sm text-ink-muted opacity-60">
              {capitalize(licenseStatus() ?? '')}
            </span>
          </Row>
          <Row label="Plan" description={planDescription()}>
            <Switch fallback={null}>
              <Match when={isTeamUser()}>
                <span class="text-sm text-ink-muted">Team managed</span>
              </Match>
              <Match when={hasPaidAccess()}>
                <span class="text-sm text-ink-muted">{planName()}</span>
              </Match>
            </Switch>
          </Row>
          <Show
            when={
              !isTeamUser() &&
              !hasPaidAccess() &&
              permissions()?.includes('write:stripe_subscription') &&
              !isNativeMobilePlatform()
            }
          >
            <ShowFeatureFlag
              key="enable-new-pricing"
              enabledOverride={ENABLE_NEW_PRICING_OVERRIDE}
              fallback={
                <div class="pt-3">
                  <PaywallComponent
                    hideCloseButton
                    cb={() => {}}
                    handleGuest={() => {}}
                  />
                </div>
              }
            >
              <div class="pt-3">
                <PaywallComponent
                  hideCloseButton
                  cb={() => {}}
                  handleGuest={() => {}}
                />
              </div>
            </ShowFeatureFlag>
          </Show>
        </Section>
      </div>

      <div class="py-6">
        <Section title="Integrations">
          <Show when={ENABLE_EMAIL && (!emailActive() || DEV_MODE_ENV)}>
            <Row label="Email">
              <Show
                when={!emailActive()}
                fallback={
                  <Button
                    variant="base"
                    size="sm"
                    depth={3}
                    onClick={() => setShowEmailModal(true)}
                  >
                    Disable
                  </Button>
                }
              >
                <Show when={!showEnableEmailModal()}>
                  <Button
                    variant="base"
                    size="sm"
                    depth={3}
                    onClick={() => setShowEnableEmailModal(true)}
                  >
                    Enable
                    <ArrowSquareOutIcon class="size-3.5" />
                  </Button>
                </Show>
              </Show>
            </Row>
          </Show>

          <Row label="GitHub">
            <Show
              when={!githubLinkExists.loading}
              fallback={<span class="text-sm text-ink-muted">Loading…</span>}
            >
              <Show
                when={!githubLinkExists()}
                fallback={
                  <Button
                    variant="base"
                    size="sm"
                    depth={3}
                    onClick={handleGithubDisable}
                  >
                    Disable
                  </Button>
                }
              >
                <Button
                  variant="base"
                  size="sm"
                  depth={3}
                  onClick={handleGithubEnable}
                >
                  Enable
                  <ArrowSquareOutIcon class="size-3.5" />
                </Button>
              </Show>
            </Show>
          </Row>
        </Section>
      </div>

      <Show when={ENABLE_AUTO_UPDATE_UI}>
        <div class="py-6">
          <Section title="App updates">
            <BundleUpdateRow />
          </Section>
        </div>
      </Show>

      <Show when={showEnableEmailModal()}>
        <div class="flex items-center gap-3 py-4">
          <div class="text-sm text-ink-muted">
            Email requires additional Google permissions. Select the permissions
            on sign-in to enable.
          </div>
          <div class="ml-auto flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              depth={3}
              onClick={() => {
                setShowEnableEmailModal(false);
                logout();
              }}
            >
              Logout
            </Button>
            <Button
              variant="ghost"
              size="sm"
              depth={3}
              onClick={() => setShowEnableEmailModal(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Show>

      <Show when={showEmailModal()}>
        <div class="flex items-center gap-3 py-4">
          <div class="text-sm text-ink-muted">
            Disabling will clear all email data from Macro
          </div>
          <div class="ml-auto flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              depth={3}
              onClick={async () => {
                setShowEmailModal(false);
                await disconnectEmail().match(
                  () => {
                    toast.success('Email disabled — clearing your email data, this may take a moment.');
                  },
                  () => {
                    toast.failure('Failed to disable email. Please try again.');
                  },
                );
              }}
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              depth={3}
              onClick={() => setShowEmailModal(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Show>

      <Show when={isNativeMobilePlatform()}>
        <div class="py-6">
          <Section title="Danger zone">
            <Row label="Delete account">
              <Button
                variant="danger"
                size="sm"
                depth={3}
                onClick={() => setShowDeleteModal(true)}
              >
                Delete
              </Button>
            </Row>
          </Section>
        </div>
        <Dialog
          open={showDeleteModal()}
          onOpenChange={setShowDeleteModal}
          position="center"
          class="w-120"
        >
          <Panel active depth={2} class="rounded-xl">
            <Panel.Header class="px-6">
              <Dialog.Title class="text-ink text-sm font-semibold">
                Delete Account
              </Dialog.Title>
            </Panel.Header>
            <Panel.Body class="p-6 font-sans flex flex-col gap-3">
              <Dialog.Description class="text-ink-muted text-sm/tight font-normal">
                Are you sure you want to delete your account? This action is
                permanent and cannot be undone.
              </Dialog.Description>
              <div class="pt-3 justify-end items-center gap-3 inline-flex">
                <Button variant="base" depth={3} onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </Button>
                <Button variant="danger" depth={3} onClick={() => {
                  setShowDeleteModal(false);
                  setShowDeleteConfirmModal(true);
                }}>
                  Delete
                </Button>
              </div>
            </Panel.Body>
          </Panel>
        </Dialog>
        <Dialog
          open={showDeleteConfirmModal()}
          onOpenChange={setShowDeleteConfirmModal}
          position="center"
          class="w-120"
        >
          <Panel active depth={2} class="rounded-xl">
            <Panel.Header class="px-6">
              <Dialog.Title class="text-ink text-sm font-semibold">
                Are you absolutely sure?
              </Dialog.Title>
            </Panel.Header>
            <Panel.Body class="p-6 font-sans flex flex-col gap-3">
              <Dialog.Description class="text-ink-muted text-sm/tight font-normal">
                This will permanently delete your account and all associated
                data. This cannot be undone.
              </Dialog.Description>
              <div class="pt-3 justify-end items-center gap-3 inline-flex">
                <Button variant="base" depth={3} onClick={() => setShowDeleteConfirmModal(false)}>
                  Cancel
                </Button>
                <Button variant="danger" depth={3} onClick={deleteAccountHandler}>
                  Delete My Account
                </Button>
              </div>
            </Panel.Body>
          </Panel>
        </Dialog>
      </Show>
    </div>
  );
}

function Section(props: { title?: string; children: JSX.Element }) {
  return (
    <div class="flex flex-col gap-3">
      <Show when={props.title}>
        <h3 class="text-sm font-semibold text-ink">{props.title}</h3>
      </Show>
      <div class="flex flex-col gap-3">{props.children}</div>
    </div>
  );
}

function Row(props: {
  label: string;
  description?: JSX.Element;
  children?: JSX.Element;
}) {
  return (
    <div class="flex min-h-10 items-center justify-between gap-4 py-1.5">
      <div class="flex min-w-0 flex-col gap-0.5">
        <div class="text-sm">{props.label}</div>
        <Show when={props.description}>
          <div class="text-xs text-ink-extra-muted">{props.description}</div>
        </Show>
      </div>
      <div class="shrink-0 text-right">{props.children}</div>
    </div>
  );
}

function NameInput(props: {
  value?: string;
  placeholder?: string;
  onSave: (value: string) => void;
}) {
  const [inputValue, setInputValue] = createSignal(props.value ?? '');
  const [isFocused, setIsFocused] = createSignal(false);

  // Keep local input synced with external value, but don't clobber while typing.
  createEffect(() => {
    if (!isFocused()) {
      setInputValue(props.value ?? '');
    }
  });

  const commit = () => {
    const next = inputValue();
    if (next === (props.value ?? '')) return;
    props.onSave(next);
  };

  const handleKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (
    e
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInputValue(props.value ?? '');
      e.currentTarget.blur();
    }
  };

  return (
    <div class="ph-no-capture group relative flex w-56 items-center gap-1 rounded-lg h-9 mobile:h-11 px-3 border text-sm bg-transparent text-ink-muted border-edge-muted hover:text-ink focus-within:text-ink focus-within:border-accent">
      <input
        type="text"
        class="flex-1 min-w-0 bg-transparent outline-none border-0 p-0 text-sm placeholder:text-ink-extra-muted"
        value={inputValue()}
        onInput={(e) => setInputValue(e.currentTarget.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          commit();
          setIsFocused(false);
        }}
        onKeyDown={handleKeyDown}
        placeholder={props.placeholder}
        autocomplete="off"
        spellcheck={false}
        data-1p-ignore
      />
    </div>
  );
}

function formatBundleUpdateStatus(status: BundleUpdateStatus): string {
  switch (status.status) {
    case 'Idle':
      return 'Idle';
    case 'CheckingForUpdate':
      return 'Checking for update…';
    case 'UpdateFound':
      return `Update available: v${status.data.version}`;
    case 'NoUpdateNeeded':
      return 'Up to date';
    case 'WaitingForWifi':
      return 'Waiting for Wi-Fi to download';
    case 'Downloading':
      return `Downloading: ${Math.round(status.data.progress)}%`;
    case 'Unzipping':
      return `Installing: ${Math.round(status.data.progress)}%`;
    case 'Completed':
      return 'Update ready';
    case 'Error':
      return 'An error occurred when checking for updates';
  }
}

function bundleUpdateAction(
  status: BundleUpdateStatus,
  cancelWifiWait: () => void
): { label: string; action: () => void } | null {
  switch (status.status) {
    case 'Idle':
      return {
        label: 'Check for update',
        action: () => invoke('check_for_update'),
      };
    case 'Error':
      return { label: 'Retry', action: () => invoke('check_for_update') };
    case 'UpdateFound':
      return {
        label: 'Download',
        action: () =>
          invoke('grant_bundle_update', { approved: true }).catch(
            console.error
          ),
      };
    case 'WaitingForWifi':
      return { label: 'Download anyway', action: cancelWifiWait };
    case 'Completed':
      return { label: 'Update', action: () => invoke('perform_update') };
    default:
      return null;
  }
}

function BundleUpdateRow() {
  const tauri = useTauri();
  return (
    <Show when={tauri}>
      {(ctx) => {
        const status = () => ctx().bundleUpdateStatus();
        const action = () => bundleUpdateAction(status(), ctx().cancelWifiWait);
        return (
          <Row
            label="App update"
            description={formatBundleUpdateStatus(status())}
          >
            <Show when={action()}>
              {(a) => (
                <Button
                  variant="active"
                  size="sm"
                  depth={3}
                  onClick={a().action}
                >
                  {a().label}
                </Button>
              )}
            </Show>
          </Row>
        );
      }}
    </Show>
  );
}

