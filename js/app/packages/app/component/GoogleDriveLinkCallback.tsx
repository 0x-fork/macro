import { LoadingBlock } from '@core/component/LoadingBlock';
import { toast } from '@core/component/Toast/Toast';
import { useFinalizeGoogleDriveLink } from '@queries/drive';
import { useNavigate } from '@solidjs/router';
import { onMount } from 'solid-js';

/**
 * Landing page for the Google Drive OAuth redirect. The shared
 * `/oauth2/google/callback` has already created the FusionAuth identity-provider
 * link; here we call `finalize` (authenticated) to persist the
 * `google_drive_links` row, then return to the app.
 */
export function GoogleDriveLinkCallback(props: { successPath: string }) {
  const navigate = useNavigate();
  const finalize = useFinalizeGoogleDriveLink();

  onMount(async () => {
    try {
      await finalize.mutateAsync();
      toast.success('Google Drive connected');
    } catch {
      toast.failure('Failed to connect Google Drive');
    }
    navigate(props.successPath, { replace: true });
  });

  return <LoadingBlock />;
}
