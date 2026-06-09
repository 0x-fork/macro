import {
  createHotkeyGroup,
  registerHotkey,
  useHotkeyDOMScope,
} from '@core/hotkey/hotkeys';
import { type HotkeyToken, TOKENS } from '@core/hotkey/tokens';
import type { ValidHotkey } from '@core/hotkey/types';
import { Match, onCleanup, onMount, Switch } from 'solid-js';
import { daysForView } from '../util/dates';
import { CalendarProvider, useCalendar } from './CalendarContext';
import { EventDialog } from './EventDialog';
import { ListView } from './ListView';
import { TimeGrid } from './TimeGrid';
import { Toolbar } from './Toolbar';

function CalendarInner() {
  const calendar = useCalendar();
  const [attachHotkeys, scopeId] = useHotkeyDOMScope('calendar');
  const group = createHotkeyGroup();
  let rootRef: HTMLDivElement | undefined;

  onMount(() => {
    if (rootRef) {
      attachHotkeys(rootRef);
      // Focus the root so j/k work without an explicit click first.
      rootRef.focus();
    }

    const bind = (
      hotkey: ValidHotkey,
      hotkeyToken: HotkeyToken,
      description: string,
      run: () => void
    ) =>
      group.add(
        registerHotkey({
          hotkey,
          scopeId,
          hotkeyToken,
          description,
          keyDownHandler: () => {
            run();
            return true;
          },
        })
      );

    // Primary navigation: vim-style j/k step one screen forward/back, matching
    // the soup list convention (j = next, k = previous).
    bind('j', TOKENS.calendar.next, 'Next', calendar.goNext);
    bind('k', TOKENS.calendar.prev, 'Previous', calendar.goPrev);
    bind('t', TOKENS.calendar.today, 'Today', calendar.goToday);
    bind('n', TOKENS.calendar.newEvent, 'New event', () => calendar.openNew());
    bind('d', TOKENS.calendar.viewDay, 'Day view', () =>
      calendar.setView('day')
    );
    bind('w', TOKENS.calendar.viewWeek, 'Week view', () =>
      calendar.setView('week')
    );
    bind('l', TOKENS.calendar.viewList, 'List view', () =>
      calendar.setView('list')
    );
  });

  onCleanup(() => group.dispose());

  return (
    <div
      ref={rootRef}
      tabindex={0}
      class="flex h-full flex-col bg-surface outline-none select-none"
    >
      <Toolbar />
      <div class="min-h-0 flex-1">
        <Switch>
          <Match when={calendar.view() === 'week'}>
            <TimeGrid days={daysForView('week', calendar.anchor())} />
          </Match>
          <Match when={calendar.view() === 'day'}>
            <TimeGrid days={daysForView('day', calendar.anchor())} />
          </Match>
          <Match when={calendar.view() === 'list'}>
            <ListView />
          </Match>
        </Switch>
      </div>
      <EventDialog />
    </div>
  );
}

/** The calendar surface, opened from the sidebar. */
export default function Calendar() {
  return (
    <CalendarProvider>
      <CalendarInner />
    </CalendarProvider>
  );
}
