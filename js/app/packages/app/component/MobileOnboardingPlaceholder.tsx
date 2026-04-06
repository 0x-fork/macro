import { toast } from '@core/component/Toast/Toast';
import { getWebOrigin } from '@core/util/webOrigin';

const APP_STORE_URL = 'https://apps.apple.com/us/app/macro-app/id6743133649';

export default function MobileOnboardingPlaceholder() {
  const desktopUrl = () => `${getWebOrigin()}/app/welcome`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(desktopUrl());
    toast.success('Link copied to clipboard');
  };

  return (
    <div class="flex flex-col justify-center min-h-dvh px-6 py-12 bg-panel">
      <div class="flex flex-col gap-6 max-w-md">
        <span class="inline-flex self-start px-3 py-1.5 text-xs font-medium bg-accent text-page rounded-xs">
          EMAIL CONNECTED!
        </span>

        <h1 class="text-4xl font-semibold text-ink leading-tight">
          Macro is better on a computer.
        </h1>

        <p class="text-xl text-ink/70 leading-relaxed">
          We just sent you a link to open on your computer.
        </p>

        <button
          type="button"
          onClick={handleCopyLink}
          class="self-start text-xl text-ink underline underline-offset-4 hover:text-ink/80 transition-colors"
        >
          Copy desktop link
        </button>

        <p class="text-xl text-ink/70 leading-relaxed">
          We recommend starting on a computer to walk through the full
          onboarding. If you also want to grab the app, it's on the{' '}
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="text-ink underline underline-offset-4 hover:text-ink/80 transition-colors"
          >
            app store
          </a>
          .
        </p>
      </div>
    </div>
  );
}
