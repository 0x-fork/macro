# Migration Plan: Orval → hey-api + TanStack Query

## Current Status: IN PROGRESS

**Completed:**
- ✅ hey-api installed and configured
- ✅ TanStack Query integration generated
- ✅ Client configured with auth interceptor
- ✅ All consumer files updated to use new imports
- ✅ SDK functions exported from client.ts

**Remaining:**
- ⚠️ **OpenAPI spec bug**: Several endpoints incorrectly define 200 responses as `type: array` when they should return single objects. This causes hey-api to generate `Array<ResponseType>` instead of `ResponseType`.
- 🔧 Fix needed in backend OpenAPI spec for: `get_thread`, `list_links`, `list_contacts`, `get_attachment`
- 🔧 Consumers need to use `unwrapResponse()` helper or access `data[0]` until spec is fixed

---

## Executive Summary

Migrate from Orval (generating raw fetch functions, mostly unused) to hey-api with TanStack Query integration. This proof-of-concept with `service-email` will establish patterns for migrating all 15+ service packages.

## Current Architecture Analysis

### What Orval Generates (NOT fully utilized)
```
service-email/
├── orval.config.ts          # Config for Orval
├── openapi.json             # OpenAPI spec (source of truth)
├── client.ts                # MANUAL wrapper using fetchWithToken
└── generated/
    ├── client.ts            # Raw fetch functions (UNUSED)
    └── schemas/             # TypeScript types (USED)
```

**Key insight**: Orval's generated fetch functions are **not used**. Only the TypeScript types from `schemas/` are imported. The manual `client.ts` builds URLs and uses `fetchWithToken` directly.

### Current Layered Fetch Architecture
```
Layer 4: TanStack Query (createQuery/createMutation)
         ↓
Layer 3: emailClient.getThread() - manual method with business logic
         ↓
Layer 2: emailFetch() - adds host prefix
         ↓
Layer 1: fetchWithToken() - auth + token refresh
         ↓
Layer 0: safeFetch() - retries, error handling, MaybeResult
         ↓
        native fetch()
```

### Authentication Flow (`fetchWithToken`)
Two modes controlled by `ENABLE_BEARER_TOKEN_AUTH`:

1. **Bearer Token (new)**: `fetchWithAuth` → gets JWT via `authServiceClient.macroApiToken()` → adds `Authorization: Bearer <token>`
2. **Cookie (legacy)**: Uses `credentials: 'include'` + automatic refresh on 401 via `/jwt/refresh`

### Error Handling: MaybeResult Pattern
```typescript
type MaybeResult<ErrorCode, T> = [null, T] | [ResultError[], null]
// Usage: const [errors, data] = await emailClient.getThread(...)
```

---

## Target Architecture

### What hey-api Will Generate
```
service-email/
├── openapi-ts.config.ts     # hey-api config (replaces orval.config.ts)
├── openapi.json             # OpenAPI spec (unchanged)
└── generated/
    ├── client.gen.ts        # Client instance with interceptors
    ├── sdk.gen.ts           # Type-safe API functions + Query options
    ├── types.gen.ts         # TypeScript types
    └── index.ts             # Re-exports
```

### New Layered Architecture
```
Layer 3: createQuery(() => getThreadOptions({ path: { id } }))
         ↓
Layer 2: hey-api SDK functions (auto-generated with types)
         ↓
Layer 1: hey-api client with interceptors (auth, error handling)
         ↓
        native fetch()
```

### Benefits
1. **Generated SDK functions actually used** - not just types
2. **TanStack Query integration out of the box** - query options, keys, infinite queries
3. **Interceptors for cross-cutting concerns** - cleaner than wrapper functions
4. **Type-safe end-to-end** - path params, query params, body, response all typed
5. **Less manual code** - no hand-written URL building

---

## Migration Plan

### Phase 1: Infrastructure Setup

#### 1.1 Install Dependencies
```bash
# Add to root package.json
bun add -D @hey-api/openapi-ts@0.x.x -E  # Pin exact version
# @tanstack/solid-query already installed (^5.90.3)
```

#### 1.2 Create Shared API Client Package
Create `packages/api-client/` for shared interceptors and configuration:

```
packages/api-client/
├── package.json
├── src/
│   ├── index.ts
│   ├── createServiceClient.ts   # Factory for service clients
│   ├── interceptors/
│   │   ├── auth.ts              # Bearer token interceptor
│   │   └── error.ts             # Error transformation
│   └── types.ts                 # Shared types
```

**Key file: `createServiceClient.ts`**
```typescript
import { createClient, type Client } from '@hey-api/client-fetch';
import { getMacroApiToken } from '@service-auth/fetch';
import { SERVER_HOSTS, type ServiceName } from '@core/constant/servers';

export function createServiceClient(serviceName: ServiceName): Client {
  const client = createClient({
    baseUrl: SERVER_HOSTS[serviceName],
  });

  // Auth interceptor - replaces fetchWithToken
  client.interceptors.request.use(async (request) => {
    const token = await getMacroApiToken();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  });

  // Error handling interceptor
  client.interceptors.response.use((response) => {
    if (!response.ok) {
      // Could transform to MaybeResult-like structure if needed
      // Or let TanStack Query handle errors natively
    }
    return response;
  });

  return client;
}
```

#### 1.3 Resolve `fetchWithToken` Open Question

**Option A: Interceptors Only (Recommended)**
- Use hey-api interceptors for auth
- Let TanStack Query handle errors via `isError`, `error` properties
- For non-query mutations, hey-api SDK functions throw on error

**Option B: Hybrid Approach**
- Keep `fetchWithToken` for legacy code
- New code uses hey-api + TanStack Query
- Gradual migration

**Recommendation**: Option A. TanStack Query's error handling is sufficient:
```typescript
const query = createQuery(() => getThreadOptions({ path: { id } }));

// Error handling
<Show when={query.isError}>
  <ErrorDisplay error={query.error} />
</Show>
```

For mutations without TanStack Query:
```typescript
try {
  const result = await sendMessage({ body: messageData });
  // success
} catch (error) {
  // error handling
}
```

### Phase 2: Migrate service-email

#### 2.1 Create hey-api Config
Replace `orval.config.ts` with `openapi-ts.config.ts`:

```typescript
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './openapi.json',
  output: {
    path: './generated',
  },
  plugins: [
    '@hey-api/typescript',      // Generate types
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: '../api-client/src/runtime',  // Shared config
    },
    '@tanstack/solid-query',    // Generate query options
  ],
});
```

#### 2.2 Generate New Client
```bash
cd packages/service-email
bunx openapi-ts
```

#### 2.3 Update package.json Scripts
```json
{
  "scripts": {
    "generate": "openapi-ts",
    "generate:watch": "openapi-ts --watch"
  }
}
```

#### 2.4 Create Client Instance
New `client.ts`:
```typescript
import { createServiceClient } from '@api-client';
import { client as generatedClient } from './generated/client.gen';

// Configure the generated client with our service client
const emailClient = createServiceClient('email-service');

// Re-export the configured client
export { emailClient };

// Re-export SDK functions for direct use
export * from './generated/sdk.gen';
export * from './generated/types.gen';
```

### Phase 3: Update Consumers

#### 3.1 Replace Manual Query Hooks
Current pattern in `macro-entity/src/queries/email.ts`:
```typescript
// OLD
export function createEmailsInfiniteQuery(...) {
  return useInfiniteQuery(() => ({
    queryKey: queryKeys.email({ infinite: true, ...params() }),
    queryFn: ({ pageParam }) => fetchPaginatedEmails({ apiToken, ...pageParam }),
    // ... manual setup
  }));
}
```

New pattern using generated options:
```typescript
// NEW
import { previewsInboxCursorInfiniteOptions } from '@service-email';

export function createEmailsInfiniteQuery(params: Accessor<PreviewParams>) {
  return createInfiniteQuery(() =>
    previewsInboxCursorInfiniteOptions({
      query: {
        limit: params().limit,
        sort_method: params().sortMethod,
        view: params().view,
      },
    })
  );
}
```

#### 3.2 Replace Direct Client Usage
Current:
```typescript
const result = await emailClient.getThread({ thread_id, offset, limit });
if (isErr(result)) return;
const [, data] = result;
```

New options:

**Option A: Use generated SDK directly**
```typescript
import { getThread } from '@service-email';

const { data, error } = await getThread({
  path: { id: thread_id },
  query: { offset, limit },
});
if (error) { /* handle */ }
```

**Option B: Use TanStack Query (preferred for reads)**
```typescript
const threadQuery = createQuery(() =>
  getThreadOptions({
    path: { id: thread_id },
    query: { offset, limit },
  })
);
```

### Phase 4: Migration Path for Other Services

#### 4.1 Checklist for Each Service
- [ ] Create `openapi-ts.config.ts`
- [ ] Run `bunx openapi-ts`
- [ ] Update exports in `client.ts`
- [ ] Update consumers to use generated functions
- [ ] Remove old `orval.config.ts`
- [ ] Remove old `generated/` folder after verification

#### 4.2 Root-Level Script
Add to root `package.json`:
```json
{
  "scripts": {
    "gen-api:email": "cd packages/service-email && bunx openapi-ts",
    "gen-api:all": "concurrently \"bun gen-api:email\" \"bun gen-api:auth\" ..."
  }
}
```

---

## TanStack DB Consideration

### Current Status
- TanStack DB is in **beta** (targeting 1.0 December 2025)
- Adds normalized client store with live queries
- Designed to work with TanStack Query

### Recommendation: Defer
For this PoC, focus on hey-api + TanStack Query only. TanStack DB can be added later when:
1. It reaches 1.0 stable
2. The hey-api migration is complete
3. There's a clear need for normalized client-side state

### Future TanStack DB Integration
```typescript
import { createCollection } from '@tanstack/solid-db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { previewsInboxCursorOptions } from '@service-email';

export const emailThreadsCollection = createCollection(
  queryCollectionOptions({
    ...previewsInboxCursorOptions({ query: { view: 'inbox' } }),
    queryClient,
    getKey: (item) => item.id,
    onUpdate: async ({ transaction }) => {
      // Optimistic update + sync
    },
  })
);
```

---

## File Changes Summary

### New Files
```
packages/api-client/              # New shared package
├── package.json
└── src/
    ├── index.ts
    ├── createServiceClient.ts
    └── interceptors/
        ├── auth.ts
        └── error.ts

packages/service-email/
└── openapi-ts.config.ts          # hey-api config
```

### Modified Files
```
package.json                      # Add @hey-api/openapi-ts
packages/service-email/
├── client.ts                     # Simplified re-exports
└── generated/                    # Replaced by hey-api output
```

### Deleted Files (after migration complete)
```
packages/service-email/
└── orval.config.ts               # Remove orval config
```

---

## Testing Strategy

1. **Unit Tests**: Verify generated types match existing usage
2. **Integration Tests**: Test auth flow with interceptors
3. **E2E Tests**: Verify email functionality works end-to-end
4. **Gradual Rollout**: Keep both systems running during migration

---

## Rollback Plan

If issues arise:
1. Keep orval config until migration verified
2. Generated code is git-ignored; can regenerate with either tool
3. Interceptors can be disabled to fall back to direct fetch

---

## Timeline Estimate

| Phase | Description | Notes |
|-------|-------------|-------|
| 1 | Infrastructure setup | Create shared api-client package |
| 2 | Migrate service-email | Generate + update consumers |
| 3 | Verify + test | E2E testing of email features |
| 4 | Template for other services | Document process |
| 5 | Migrate remaining services | 14 more packages |

---

## Open Questions Resolved

### Q: How to incorporate `fetchWithToken` into TanStack Query?
**A**: Use hey-api interceptors instead. The `getMacroApiToken()` function from `@service-auth/fetch` can be called in a request interceptor to add the Bearer token. This is cleaner than wrapping fetch functions.

### Q: What about MaybeResult error handling?
**A**: TanStack Query has built-in error handling (`isError`, `error`, `onError`). For mutations without TanStack Query, hey-api SDK functions throw errors which can be caught with try/catch. This is more idiomatic TypeScript than tuple-based results.

### Q: Should we use TanStack DB?
**A**: Defer for now. It's in beta and adds complexity. Focus on hey-api + TanStack Query first, which provides immediate value without the risk of beta software.
