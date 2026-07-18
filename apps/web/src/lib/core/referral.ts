/**
 * Referral-code persistence.
 *
 * A referral code historically only survived as a `?referral_code=` URL param,
 * so it was lost whenever a referred visitor browsed away from the signup URL
 * (e.g. landed on the marketing site first). These helpers persist the code
 * (last touch wins) so it can be recovered at signup time.
 *
 * Storage layers, newest-touch-first on read:
 * - `macro_ref` cookie — set with `Domain=.macro.com` when running on a
 *   macro.com host so it is shared with the marketing site (which sets the
 *   same cookie on landing; see solid-site). Note Safari ITP caps
 *   JS-set cookies at ~7 days.
 * - `macro_referral_code` localStorage — same-origin fallback (also covers
 *   non-macro.com hosts and environments that block third-party cookies).
 */

const STORAGE_KEY = 'macro_referral_code';
const COOKIE_NAME = 'macro_ref';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function readCookie(name: string): string | undefined {
  try {
    for (const part of document.cookie.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === name) {
        const value = decodeURIComponent(rest.join('='));
        if (value) return value;
      }
    }
  } catch {
    // document.cookie can throw in sandboxed contexts
  }
  return undefined;
}

/** Persist a referral code to localStorage and (on macro.com hosts) a domain-wide cookie. Last touch wins. */
export function persistReferralCode(code: string) {
  if (!code) return;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // storage may be unavailable (private mode / blocked)
  }
  try {
    const host = window.location.hostname;
    const onMacroDomain = host === 'macro.com' || host.endsWith('.macro.com');
    const attrs = [
      `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
      'Path=/',
      'SameSite=Lax',
      ...(onMacroDomain ? ['Domain=.macro.com', 'Secure'] : []),
    ];
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(code)}; ${attrs.join('; ')}`;
  } catch {
    // ignore — localStorage above is the fallback
  }
}

/** Referral code previously stored by the app or the marketing site. */
export function getStoredReferralCode(): string | undefined {
  const fromCookie = readCookie(COOKIE_NAME);
  if (fromCookie) return fromCookie;
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The referral code to attach to a login/signup request.
 * The current URL's `referral_code` param wins (and is persisted as the
 * latest touch); otherwise falls back to the stored code.
 */
export function resolveReferralCode(): string | undefined {
  const fromUrl = new URL(window.location.href).searchParams.get(
    'referral_code'
  );
  if (fromUrl) {
    persistReferralCode(fromUrl);
    return fromUrl;
  }
  return getStoredReferralCode();
}

/** Capture a referral code from the current URL, if present, without reading it back. */
export function captureReferralCodeFromUrl() {
  const fromUrl = new URL(window.location.href).searchParams.get(
    'referral_code'
  );
  if (fromUrl) persistReferralCode(fromUrl);
}

/**
 * Marketing-site landing URL carrying a referral code (used as the email
 * watermark link). The marketing site + app persist the code so the credit
 * survives until the recipient signs up.
 */
export function referralLandingUrl(code: string | undefined): string {
  if (!code) return 'https://macro.com/';
  return `https://macro.com/?referral_code=${encodeURIComponent(code)}`;
}
