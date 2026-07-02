/**
 * URL parsing for embeddable third-party content (X/Twitter posts, YouTube
 * videos, Figma files). Shared by the embed markdown transformer, the paste
 * handling, and the embed render components.
 */

export type EmbedProvider = 'x' | 'youtube' | 'figma';

export type EmbedData = {
  provider: EmbedProvider;
  url: string;
};

const X_STATUS_REGEX =
  /^https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?\w{1,15}\/status(?:es)?\/(\d+)/i;

const YOUTUBE_WATCH_REGEX =
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#\s]*&)?v=([\w-]{11})/i;
const YOUTUBE_SHORT_URL_REGEX = /^https?:\/\/(?:www\.)?youtu\.be\/([\w-]{11})/i;
const YOUTUBE_PATH_REGEX =
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:shorts|live|embed)\/([\w-]{11})/i;

const FIGMA_FILE_REGEX =
  /^https?:\/\/(?:www\.)?figma\.com\/(?:file|design|proto|board|slides|deck)\/[\w-]+/i;

export function getTweetId(url: string): string | null {
  return url.match(X_STATUS_REGEX)?.[1] ?? null;
}

export function getYouTubeVideoId(url: string): string | null {
  return (
    url.match(YOUTUBE_WATCH_REGEX)?.[1] ??
    url.match(YOUTUBE_SHORT_URL_REGEX)?.[1] ??
    url.match(YOUTUBE_PATH_REGEX)?.[1] ??
    null
  );
}

/** Parse a YouTube `t`/`start` parameter ("90", "90s", "1h2m30s") to seconds. */
export function getYouTubeStartSeconds(url: string): number | null {
  const raw = url.match(/[?&](?:t|start)=([\dhms]+)/i)?.[1];
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  const [, hours, minutes, seconds] = match;
  return (
    (hours ? parseInt(hours, 10) * 3600 : 0) +
    (minutes ? parseInt(minutes, 10) * 60 : 0) +
    (seconds ? parseInt(seconds, 10) : 0)
  );
}

function isFigmaFileUrl(url: string): boolean {
  return FIGMA_FILE_REGEX.test(url);
}

/**
 * Check whether a URL points to embeddable third-party content.
 * Returns the provider and the original URL, or null when not embeddable.
 */
export function parseEmbedUrl(url: string): EmbedData | null {
  const trimmed = url.trim();
  if (getTweetId(trimmed)) return { provider: 'x', url: trimmed };
  if (getYouTubeVideoId(trimmed)) return { provider: 'youtube', url: trimmed };
  if (isFigmaFileUrl(trimmed)) return { provider: 'figma', url: trimmed };
  return null;
}

/** True when the text is a single line containing only an embeddable URL. */
export function isLoneEmbedUrl(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return parseEmbedUrl(trimmed) !== null;
}
