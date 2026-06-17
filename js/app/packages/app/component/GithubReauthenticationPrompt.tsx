import { toast } from '@core/component/Toast/Toast';
import { authServiceClient } from '@service-auth/client';
import { makePersisted } from '@solid-primitives/storage';
import { createSignal, onMount } from 'solid-js';

export const createDismissedGithubReauthSignal = () => {
  return makePersisted(createSignal(false), {
    name: 'dismissed-github-reauth-toast',
  });
};

let githubReauthenticationToastId: number | undefined;

function clearGithubReauthenticationToastState(): void {
  githubReauthenticationToastId = undefined;
}

async function handleGithubReauthenticationToastAction(): Promise<void> {
  if (githubReauthenticationToastId !== undefined) {
    toast.dismiss(githubReauthenticationToastId);
  }
  clearGithubReauthenticationToastState();

  const redirectUrl = new URL(window.location.href);
  redirectUrl.searchParams.append('github', 'reconnected');

  const result = await authServiceClient.reauthenticateGithub(
    redirectUrl.toString()
  );
  if (result.isErr()) {
    toast.failure('Failed to start GitHub reconnect flow');
    return;
  }

  window.location.href = result.value;
}

function showGithubReauthenticationToast(): void {
  if (githubReauthenticationToastId !== undefined) return;

  const [, setDismissedToast] = createDismissedGithubReauthSignal();

  githubReauthenticationToastId = toast.custom(
    {
      title: 'Reconnect GitHub',
      content(): string {
        return 'Your GitHub authorization has expired. Reconnect GitHub to restore pull request details.';
      },
      actions: [
        {
          label: 'Reconnect',
          onClick: handleGithubReauthenticationToastAction,
        },
      ],
    },
    {
      persistent: true,
      onDismiss: () => {
        clearGithubReauthenticationToastState();
        setDismissedToast(true);
      },
    }
  );
}

async function checkGithubReauthenticationStatus(): Promise<void> {
  const [dismissedToast, setDismissedToast] =
    createDismissedGithubReauthSignal();

  const nextURL = new URL(window.location.href);
  const searchParams = nextURL.searchParams;

  if (searchParams.has('github', 'reconnected')) {
    searchParams.delete('github');
    setDismissedToast(false);
    window.location.href = nextURL.toString();
  }

  const response = await authServiceClient.checkGithubLinkStatus();

  const needsReauthentication = response.isOk()
    ? response.value.reauthentication_required
    : response.error.some(
        (error) => error.code === 'REAUTHENTICATION_REQUIRED'
      );

  if (needsReauthentication && !dismissedToast()) {
    showGithubReauthenticationToast();
  }
}

export function GithubReauthenticationPrompt() {
  onMount(() => {
    void checkGithubReauthenticationStatus();
  });

  return null;
}
