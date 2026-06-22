import { DashboardToolView } from '@app/component/dynamic-ui/DashboardToolView.lazy';
import { createDelegatedToolRenderer } from './Delegated';

/**
 * `DisplayResults` is a DELEGATED tool: the primary agent calls it name-only,
 * and a fast secondary agent composes the dynamic-UI `view`. The composed view
 * arrives in the tool RESPONSE (`args.view`), not the call arguments, so we
 * render from the delegated response's `args`. The delegation is invisible — the
 * user sees the same dashboard as if the primary agent had produced the view
 * directly.
 *
 * `DashboardToolView` is imported from `@app` already wrapped in `lazy()` — the
 * dynamic-ui tree is entity-heavy and lives in a module-init cycle, so the lazy
 * boundary (owned by `@app`, like the split-layout component registry) keeps it
 * out of the eager startup graph. See `DashboardToolView.lazy.ts`.
 */
const handler = createDelegatedToolRenderer({
  name: 'DisplayResults',
  render: (ctx) => <DashboardToolView view={ctx.args?.view} />,
});

export const displayResultsHandler = handler;
