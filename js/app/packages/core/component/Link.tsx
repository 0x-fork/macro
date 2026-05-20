import LinkIcon from '@phosphor/link.svg';
import { proxyResource } from '@service-unfurl/client';
import type { GetUnfurlResponse } from '@service-unfurl/generated/schemas/getUnfurlResponse';
import { Show } from 'solid-js';
import { createStore } from 'solid-js/store';

function extractDomain(url: string) {
  try {
    const address = new URL('', url);
    return address.hostname;
  } catch {
    return url;
  }
}

const [badLinks, setBadLinks] = createStore<Record<string, true>>({});
export type UnfurlLinkProps = { unfurled: GetUnfurlResponse };

export function UnfurlLink(props: UnfurlLinkProps) {
  const domain = extractDomain(props.unfurled.url);

  return (
    <div
      class="hover:bg-hover p-1 px-1.5 overflow-clip text-xs transition-colors hover:transition-none"
      onClick={() => window.open(props.unfurled.url)}
    >
      <div class="flex flex-row items-center gap-1.5 size-full">
        <div class="shrink-0">
          <Show
            when={props.unfurled.favicon_url}
            fallback={<LinkIcon class="size-4" />}
          >
            {(icon) => (
              <Show
                when={!badLinks[icon()]}
                fallback={<LinkIcon class="size-4" />}
              >
                <img
                  src={proxyResource(icon())}
                  class="content-center rounded-sm size-4 object-cover"
                  crossorigin="anonymous"
                  alt="ico"
                  on:error={() => {
                    setBadLinks(icon(), true);
                  }}
                />
              </Show>
            )}
          </Show>
        </div>
        <div class="min-w-0">
          <h1 class="font-medium truncate text-ink">
            {props.unfurled.title || domain}
          </h1>
          <h2 class="font-medium text-xxs text-ink-muted">{domain}</h2>
        </div>
      </div>
    </div>
  );
}
