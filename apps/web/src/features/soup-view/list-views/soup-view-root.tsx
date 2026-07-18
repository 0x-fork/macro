import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import type { JSX } from 'solid-js';
import { useSoupView } from '../context';

type SoupViewRootProps = {
  ref: (element: HTMLDivElement) => void;
  listScopeId: string;
  children: JSX.Element;
};

/** The focusable DOM root for a concrete Soup view composition. */
export function SoupViewRoot(props: SoupViewRootProps) {
  const panel = useSplitPanelOrThrow();
  const view = useSoupView();

  return (
    <div
      ref={props.ref}
      class="size-full min-h-0 min-w-0 flex flex-col no-select-children"
      tabIndex={-1}
      data-soup-view
      data-list-view={view.view()}
      data-soup-view-id={panel.handle.id}
      data-hotkey-scope={props.listScopeId}
      onFocusIn={(event) => event.stopPropagation()}
    >
      {props.children}
    </div>
  );
}
