import { render } from 'solid-js/web';
import { NoiseBackground } from '../src/features/setup/flow/shared';
import { TeamStep } from '../src/features/setup/flow/TeamStep';
import { DEFAULT_THEMES } from '../src/features/theme/constants';
import './harness.css';

/** Paints one of the app's real theme presets onto :root. */
function applyTheme(id: string) {
  const theme = DEFAULT_THEMES.find((t) => t.id === id);
  if (!theme) throw new Error(`no theme ${id}`);
  const root = document.documentElement;
  for (const [key, v] of Object.entries(
    theme.tokens as Record<string, { l: number; c: number; h: number }>
  )) {
    root.style.setProperty(`--${key}l`, `${v.l}`);
    root.style.setProperty(`--${key}c`, `${v.c}`);
    root.style.setProperty(`--${key}h`, `${v.h}deg`);
  }
  const tokens = theme.tokens as Record<string, { l: number }>;
  root.dataset.themeLight = tokens.b0.l > tokens.c0.l ? 'true' : 'false';
}

/**
 * Renders the onboarding team step on its own, with the flow's card chrome
 * copied from OnboardingFlow, so it can be screenshotted without a backend.
 * `?scenario=plain` swaps in a personal-email user; `?theme=dark` flips it.
 */
function Harness() {
  const params = new URLSearchParams(window.location.search);
  applyTheme(params.get('theme') === 'dark' ? 'Macro Dark' : 'Macro Light');

  return (
    <div class="relative size-full overflow-hidden bg-surface font-sans text-ink">
      <NoiseBackground />
      <div class="relative z-10 size-full overflow-y-auto overscroll-contain">
        <div class="flex min-h-full items-center justify-center px-6 py-12">
          <div class="w-full sm:max-w-lg">
            <div class="flex flex-col gap-8">
              <div class="flex flex-col gap-1.5">
                <h1 class="text-2xl font-semibold tracking-tight text-ink">
                  Macro is meant for teams
                </h1>
                <p class="max-w-md text-sm leading-relaxed text-ink-muted">
                  Macro is built to be used with others. Invite your team to
                  share docs, channels, and context from day one.
                </p>
              </div>
              <div class="flex flex-col gap-8">
                <TeamStep
                  onContinue={() => console.log('[continue]')}
                  onSkip={() => console.log('[skip]')}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) render(() => <Harness />, root);
