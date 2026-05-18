import { useAnalytics } from '@app/component/analytics-context';
import type { ListView } from '@app/constants/list-views';
import { hapticImpact } from '@core/mobile/haptics';
import PlusIcon from '@icon/plus.svg';
import { Button } from '@ui';
import { createMemo, Show } from 'solid-js';
import { runCreateAction, setCreateMenuOpen } from '../../Launcher';

export function SoupViewMobileCreateButton(props: {
  activeView: () => ListView | undefined;
}) {
  const analytics = useAnalytics();

  const VIEW_CREATE_ACTIONS: Partial<Record<ListView, () => void>> = {
    agents: () => {
      analytics.track('create_entity', {
        entityType: 'chat',
        source: 'mobile_header',
      });
      runCreateAction('chat');
    },
    mail: () => {
      analytics.track('create_entity', {
        entityType: 'email',
        source: 'mobile_header',
      });
      runCreateAction('email');
    },
    documents: () => {
      analytics.track('create_menu_open', { from: 'mobile_header' });
      setCreateMenuOpen(true);
    },
    tasks: () => {
      analytics.track('create_entity', {
        entityType: 'task',
        source: 'mobile_header',
      });
      runCreateAction('task');
    },
    channels: () => {
      analytics.track('create_entity', {
        entityType: 'channel',
        source: 'mobile_header',
      });
      runCreateAction('channel');
    },
    inbox: () => {
      analytics.track('create_menu_open', { from: 'mobile_header' });
      setCreateMenuOpen(true);
    },
  };

  const createAction = createMemo(() => {
    const view = props.activeView();
    if (!view || view === 'search') return undefined;
    return (
      VIEW_CREATE_ACTIONS[view] ??
      (() => {
        analytics.track('create_menu_open', { from: 'mobile_header' });
        setCreateMenuOpen(true);
      })
    );
  });

  return (
    <Show when={createAction()}>
      <Button
        variant="base"
        size="sm"
        class="rounded-md py-1.5 [&_svg]:size-4"
        onClick={() => {
          hapticImpact('light');
          createAction()?.();
        }}
      >
        <PlusIcon />
        <span>New</span>
      </Button>
    </Show>
  );
}
