import { ErrorBoundary, Match, Switch, type JSXElement } from 'solid-js';
import { FatalError } from './FatalError';
import { NotFoundPage } from './NotFoundPage';

const KNOWN_ERROR_CAUSES = ['unknown_component'] as const;
type KnownErrorCause = (typeof KNOWN_ERROR_CAUSES)[number];

interface KnownErrorBoundaryProps {
  children: JSXElement;
}

function isKnownError(
  error: unknown
): error is Error & { cause: KnownErrorCause } {
  return (
    error instanceof Error &&
    typeof error.cause === 'string' &&
    KNOWN_ERROR_CAUSES.includes(error.cause as KnownErrorCause)
  );
}

function KnownErrorFallback(props: { error: unknown; reset: () => void }) {
  return (
    <Switch
      fallback={<FatalError error={props.error as Error} reset={props.reset} />}
    >
      <Match
        when={
          isKnownError(props.error) && props.error.cause === 'unknown_component'
        }
      >
        <NotFoundPage />
      </Match>
    </Switch>
  );
}

export function KnownErrorBoundary(props: KnownErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <KnownErrorFallback error={error} reset={reset} />
      )}
    >
      {props.children}
    </ErrorBoundary>
  );
}
