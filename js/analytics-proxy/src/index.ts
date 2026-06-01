const PROVIDERS: Record<string, string> = {
  '/i/ph': 'us.i.posthog.com',
};

const BACKGROUND_DISPATCH_PATHS = new Set(['/batch', '/capture', '/e']);

type WorkerContext = {
  waitUntil(promise: Promise<unknown>): void;
};

function getProvider(pathname: string): { apiHost: string; path: string } | null {
  for (const [prefix, apiHost] of Object.entries(PROVIDERS)) {
    if (pathname.startsWith(prefix)) {
      return { apiHost, path: pathname.slice(prefix.length) || '/' };
    }
  }
  return null;
}

function normalizePath(pathname: string): string {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '');
}

function isBackgroundDispatchPath(pathname: string): boolean {
  return BACKGROUND_DISPATCH_PATHS.has(normalizePath(pathname));
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const requestOrigin = request.headers.get('Origin');
  const requestedHeaders = request.headers.get('Access-Control-Request-Headers');

  headers.set('Access-Control-Allow-Origin', requestOrigin ?? '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    requestedHeaders ?? 'Content-Type, Authorization'
  );
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Vary', 'Origin, Access-Control-Request-Headers');

  return headers;
}

async function handleProxy(
  request: Request,
  apiHost: string,
  pathWithSearch: string
): Promise<Response> {
  const originHeaders = new Headers(request.headers);
  originHeaders.delete('cookie');
  originHeaders.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');

  const originRequest = new Request(`https://${apiHost}${pathWithSearch}`, {
    method: request.method,
    headers: originHeaders,
    body:
      request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.arrayBuffer()
        : null,
    redirect: request.redirect,
  });

  return await fetch(originRequest);
}

async function dispatchProxyInBackground(
  request: Request,
  apiHost: string,
  pathWithSearch: string,
  pathForLog: string
): Promise<void> {
  try {
    const response = await handleProxy(request, apiHost, pathWithSearch);
    if (!response.ok) {
      console.warn('PostHog tracking proxy dispatch failed', {
        path: pathForLog,
        status: response.status,
      });
    }
    await response.body?.cancel();
  } catch (error) {
    console.error('PostHog tracking proxy dispatch failed', {
      path: pathForLog,
      error,
    });
  }
}

export default {
  async fetch(
    request: Request,
    _env: unknown,
    ctx: WorkerContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const provider = getProvider(url.pathname);

    if (!provider) {
      return new Response('Not found', { status: 404 });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (
      request.method !== 'GET' &&
      request.method !== 'HEAD' &&
      isBackgroundDispatchPath(provider.path)
    ) {
      ctx.waitUntil(
        dispatchProxyInBackground(
          request,
          provider.apiHost,
          provider.path + url.search,
          provider.path
        )
      );

      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    return handleProxy(request, provider.apiHost, provider.path + url.search);
  },
};
