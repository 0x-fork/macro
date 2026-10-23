import { openCalendarView } from '@app/features/calendar-view/calendar-navigation';
import {
  calendarSearch,
  calendarSearchTarget,
  calendarTargetSearch,
} from '@app/features/calendar-view/calendar-url';
import { CALENDAR_VIEW_ID } from '@app/features/calendar-view/types';
import type { CalendarPreviewSelection } from '@app/features/next-soup/utils';
import {
  createSearchParams,
  type SerializedSearchParams,
  useNavigate,
  useRouteParams,
} from '@app/lib/split-router';
import { homeCalendarRoute } from '@app/routes/routes';
import { globalSplitManager } from '@app/signal/splitLayout';
import { previewCalendarTarget } from '@components/app/previewTarget';
import {
  enableCalendarUi,
  isFeatureEnabled,
} from '@core/constant/featureFlags';
import { fireAndForget } from '@core/util/fireAndForget';
import deepEqual from 'fast-deep-equal';
import { createSignal } from 'solid-js';
import { homeCalendarNavigation } from './home-preview-navigation';

type WithTab = (
  search: Record<string, SerializedSearchParams | undefined>
) => Record<string, SerializedSearchParams | undefined>;

/** Owns Home's inline Calendar location and repeat-click event refocus. */
export function useHomeCalendarPreview(withTab: WithTab) {
  const navigate = useNavigate();
  const calendarParams = useRouteParams(homeCalendarRoute);
  const [openCalendarSearch] = createSearchParams(calendarSearch);
  const [calendarRefocus, setCalendarRefocus] = createSignal(0);
  const calendarOpen = () => typeof calendarParams.period === 'string';

  const openCalendarEvent = (
    entity: CalendarPreviewSelection,
    options: { activate?: boolean } = {}
  ) => {
    if (!isFeatureEnabled(enableCalendarUi)) return false;
    const calendarTarget = previewCalendarTarget(entity);
    const navigation = homeCalendarNavigation(calendarTarget);
    if (!navigation) return false;
    // A Calendar already open in another split takes the event, as it does
    // from the notifications panel, instead of a second calendar in Home.
    if (
      globalSplitManager()?.getSplitByContent('component', CALENDAR_VIEW_ID)
    ) {
      openCalendarView(calendarTarget, {
        activate: options.activate ?? false,
        referredFrom: 'home',
      });
      return true;
    }
    const alreadyOpen =
      calendarOpen() &&
      calendarParams.period === navigation.params.period &&
      deepEqual(
        calendarTargetSearch(calendarTarget),
        calendarTargetSearch(calendarSearchTarget(openCalendarSearch))
      );
    // The same URL still needs to refocus the event in the inline calendar.
    if (alreadyOpen) setCalendarRefocus((count) => count + 1);
    else
      fireAndForget(
        navigate(
          { route: homeCalendarRoute, params: navigation.params },
          { search: withTab(navigation.search) }
        ),
        'home-view'
      );
    return true;
  };

  return { calendarOpen, calendarRefocus, openCalendarEvent };
}
