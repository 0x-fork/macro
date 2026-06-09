import CaretLeftIcon from '@phosphor/caret-left.svg';
import CaretRightIcon from '@phosphor/caret-right.svg';
import PlusIcon from '@phosphor/plus.svg';
import { Button, SegmentedControl } from '@ui';
import type { CalendarViewMode } from '../model/types';
import { formatViewTitle } from '../util/dates';
import { useCalendar } from './CalendarContext';

const VIEW_OPTIONS: { value: CalendarViewMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'list', label: 'List' },
];

export function Toolbar() {
  const calendar = useCalendar();

  return (
    <div class="flex items-center gap-3 border-b border-edge-muted px-3 py-2">
      <Button variant="base" size="sm" depth={2} onClick={calendar.goToday}>
        Today
      </Button>

      <div class="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Previous"
          onClick={calendar.goPrev}
          class="[&_svg]:size-4"
        >
          <CaretLeftIcon />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Next"
          onClick={calendar.goNext}
          class="[&_svg]:size-4"
        >
          <CaretRightIcon />
        </Button>
      </div>

      <h1 class="min-w-0 flex-1 truncate text-base font-semibold text-ink">
        {formatViewTitle(calendar.view(), calendar.anchor())}
      </h1>

      <SegmentedControl
        size="sm"
        aria-label="Calendar view"
        value={calendar.view()}
        options={VIEW_OPTIONS}
        onChange={calendar.setView}
      />

      <Button
        variant="cta"
        size="sm"
        onClick={() => calendar.openNew()}
        class="[&_svg]:size-4"
      >
        <PlusIcon />
        New event
      </Button>
    </div>
  );
}
