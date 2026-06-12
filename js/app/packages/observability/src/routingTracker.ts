import { useLocation } from '@solidjs/router';
import { createEffect, createMemo, on } from 'solid-js';
import { getImpl, isInitialized } from './shared';

export function useObserveRouting() {
  const location = useLocation();
  const pathSegments = createMemo(() =>
    location.pathname
      .split('/')
      .filter((segment) => !!segment && segment !== 'app')
  );
  const viewName = () =>
    pathSegments().at(0) === 'component'
      ? pathSegments().at(1)
      : pathSegments().at(0);
  createEffect(
    on(viewName, (name, prevName) => {
      const impl = getImpl();
      if (!isInitialized() || !impl || !name) return;

      if (name !== prevName) {
        impl.startView({
          name,
          context: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          },
        });
      }

      return name;
    })
  );

  const joinedPath = createMemo(() => pathSegments().join('/'));
  createEffect((prevSplits) => {
    const splits = joinedPath();

    const impl = getImpl();
    if (!isInitialized() || !impl) return;
    if (splits !== prevSplits) {
      impl.addAction('split changed', {
        from: prevSplits,
        to: splits,
      });
    }

    return splits;
  });
}
