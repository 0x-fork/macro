import { TabContentRow } from '@core/component/TabContent';
import EditableField from '@core/component/EditableField';
import { capitalize } from '@block-pdf/util/StringUtils';
import { useHasPaidAccess } from '@core/auth/license';
import { useLogout } from '@core/auth/logout';
import {
  blockNameToFileExtensions,
  blockNameToMimeTypes,
} from '@core/constant/allBlocks';
import {
  DEV_MODE_ENV,
  ENABLE_EMAIL,
  ENABLE_PROFILE_PICTURES,
} from '@core/constant/featureFlags';
import { usePaywallState } from '@core/constant/PaywallState';
import { fileSelector } from '@core/directive/fileSelector';
import {
  type ProfilePictureItem,
  useProfilePictureUrl,
} from '@core/signal/profilePicture';
import { useOrganizationName } from '@core/user';
import Logout from '@icon/regular/sign-out.svg';
import IconUpload from '@macro-icons/macro-upload.svg';
import { authServiceClient } from '@service-auth/client';
import { useEmail, useLicenseStatus, useUserId } from '@service-gql/client';
import { createMemo, createResource, createSignal, Show } from 'solid-js';
import {
    useEmailLinks,
  useEmailLinksStatus,
} from '@core/email-link';
import {
  type SupportedNotificationSettings,
  useNotificationSettings,
} from '@notifications';
import { toast } from '@core/component/Toast/Toast';
import { staticFileIdEndpoint } from '@core/constant/servers';
import { createStaticFile } from '@core/util/create';
import { Button } from '@ui/components/Button';
import { BetaBadge } from '@core/component/BetaBadge';
import { Avatar } from '@ui/components/Avatar';

// NOTE: solid directives
false && fileSelector;

// 16 megabytes
const MAX_FILE_SIZE = 16 * 1000 * 1000;

async function uploadProfilePicture(
  file: File
): Promise<{ id: string; url: string } | void> {
  if (file.size > MAX_FILE_SIZE) {
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
    const [_, response] = await authServiceClient.getUserName();
    if (response) {
      return response;
    }

    return null;
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
  const organizationName = useOrganizationName();
  const licenseStatus = useLicenseStatus();
  const logout = useLogout();
  const { showPaywall } = usePaywallState();
  const hasPaidAccess = useHasPaidAccess();
  const [showEmailModal, setShowEmailModal] = createSignal<boolean>(false);

  const { connect: connectEmail, disconnect: disconnectEmail } = useEmailLinks();

  const userName = useUserName();
  const [updatedFirstName, setUpdatedFirstName] = createSignal<
    string | undefined
  >(undefined);
  const [updatedLastName, setUpdatedLastName] = createSignal<
    string | undefined
  >(undefined);

  const emailActive = useEmailLinksStatus();
  const [profilePicUrl] = useProfilePictureUrl(userId());

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

  const nameOrEmail = () => {
    return [firstName(), lastName()].filter(Boolean).join(' ') || email() || 'User';
  };

  const logoutHandler = () => {
    let redirectUrl = window.location.origin;
    logout(redirectUrl);
  };

  return (
    <div class="absolute inset-0 overflow-y-auto" style="scrollbar-width: none;">
        <div class="p-2">
          <div class="mb-12 text-ink">
          <Show when={ENABLE_PROFILE_PICTURES}>
          <TabContentRow
            isLoading={!userId()}
            text="Profile Picture"
            subtext={''}
          >
            <Show when={userId()}>
              <div class="flex items-center">
                <Avatar 
                  for={nameOrEmail()} 
                  src={profilePicUrl()} 
                  class="text-lg leading-loose"
                />

                <div
                  class="ml-2"
                  use:fileSelector={{
                    acceptedFileExtensions: blockNameToFileExtensions.image,
                    acceptedMimeTypes: blockNameToMimeTypes.image,
                    onSelect: async (files: File[]) => {
                      let response = await uploadProfilePicture(files[0]);
                      if (!response || !userId()) return;
                      let { url } = response;
                      let pic: ProfilePictureItem = {
                        _createdAt: new Date(),
                        url,
                        id: userId()!,
                        loading: false,
                      };
                      // update the cache directly to force a reload
                      const [_, controls] = useProfilePictureUrl(userId());
                      controls.mutate(pic);
                    },
                  }}
                >
                  <Button class="bg-accent/10 hover:bg-accent/20 text-accent-ink border-accent/30 text-xs p-2">
                    <IconUpload class="h-[1lh]" /> Upload
                  </Button>
                </div>
              </div>
            </Show>
          </TabContentRow>
        </Show>
        <TabContentRow isLoading={!userId()} text="First Name" subtext={''}>
          <EditableField
            value={firstName()}
            onSave={(newValue: string) => {
              setUpdatedFirstName(newValue);
              authServiceClient.putUserName({ first_name: newValue });
            }}
            placeholder="Enter first name"
            allowEmpty={true}
          />
        </TabContentRow>
        <TabContentRow isLoading={!userId()} text="Last Name" subtext={''}>
          <EditableField
            value={lastName()}
            onSave={(newValue: string) => {
              setUpdatedLastName(newValue);
              authServiceClient.putUserName({ last_name: newValue });
            }}
            placeholder="Enter last name"
            allowEmpty={true}
          />
        </TabContentRow>
        <TabContentRow
          isLoading={!email()}
          text="Email"
          subtext={email() ?? ''}
        />
        <Show when={organizationName()}>
          {(name) => <TabContentRow text="Organization" subtext={name()} />}
        </Show>

        <div class="flex gap-4 items-center">
          <TabContentRow
            isLoading={!licenseStatus()}
            text="License Status"
            subtext={capitalize(licenseStatus() ?? '')}
          />
          <Show when={!hasPaidAccess()}>
            <Button
              variant="primary"
              onClick={() => showPaywall()}
              class="mb-[18px]"
            >
              Upgrade
            </Button>
          </Show>
        </div>
        <Show when={ENABLE_EMAIL && (!emailActive() || DEV_MODE_ENV)}>
          <div
            class={`flex items-center text-sm justify-between ${!showEmailModal() && 'mb-[18px]'}`}
          >
            <div class="text-sm">Email</div>
            <Show
              when={!emailActive() && DEV_MODE_ENV}
              fallback={
                <Button 
                  variant="secondary" 
                  onClick={() => {
                  setShowEmailModal(true);
                }}>
                  Disable
                </Button>
              }
            >
                 
              <Button 
                variant="secondary" 
                onClick={connectEmail}
                tooltip={
                  <div>
                    <div class="w-min bg-surface-0 rounded-lg mb-2">
                      <BetaBadge />
                    </div>
                    <p class="max-w-40">Enabling an email address different from the current Macro user's will result in session termination.</p>
                  </div>}
              >
                Enable
              </Button>
            </Show>
          </div>
        </Show>
        <Show when={showEmailModal()}>
          <div class="flex flex-row items-center">
            <div class="mb-[18px] text-sm pt-4">
              Disabling will clear all email data from Macro
            </div>
            <div class="ml-auto flex flex-row text-xs gap-1">
              <Button 
                variant="destructive"
                onClick={() => {
                  disconnectEmail();
                  setShowEmailModal(false);
                }}>Confirm</Button>

              <Button onClick={() => setShowEmailModal(false)}>Cancel</Button>
            </div>
          </div>
        </Show>
        <NotificationToggle />
        <div class="flex flex-row justify-between items-center border-t border-edge pt-2">
          <div
            class="mb-4.5 flex flex-row justify-start items-center gap-1"
            onClick={logoutHandler}
          >
            <Logout class="w-4 h-4" />
            <div class="text-sm select-none">Logout</div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationToggle() {
  const settings = useNotificationSettings();

  return (
    <Show
      when={settings.isSupported && settings}
      fallback={<NotificationNotSupported />}
    >
      {(s) => <NotificationSettings settings={s()} />}
    </Show>
  );
}

function NotificationSettings(props: {
  settings: SupportedNotificationSettings;
}) {
  return (
    <div class="flex items-center justify-between mb-[18px] text-sm">
      <div class="text-sm">Notifications</div>
      <Button
        variant="secondary"
        onClick={() => props.settings.toggle(!props.settings.isEnabled())}
      >
        {props.settings.isEnabled() ? "Disable" : "Enable"}
      </Button>
    </div>
  );
}

function NotificationNotSupported() {
  return (
    <div class="flex items-center justify-between mb-[18px]">
      <div class="text-sm">Notifications</div>
      <span class="text-sm text-ink-muted">Not supported on this device</span>
    </div>
  );
}
