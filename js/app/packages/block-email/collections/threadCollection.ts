// Re-export thread queries from @queries/email
// This file exists for backwards compatibility - prefer importing from @queries/email directly
export {
  fetchAndCacheThread,
  getCachedThread,
  updateCachedThread,
  invalidateCachedThread,
} from '@queries/email';
