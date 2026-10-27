import { useCalendarUiFlag } from '@app/features/calendar/hooks/use-calendar-ui-flag';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { getIconConfig } from '@core/component/EntityIcon';
import {
  enableCalendarScheduling,
  enableCrm,
  enableTasksReviews,
  enableWhatsappLinked,
} from '@core/constant/featureFlags';
import BellFillIcon from '@icon/system/fill/bell-fill.svg';
import BuildingsFillIcon from '@icon/system/fill/buildings-fill.svg';
import CalendarBlankFillIcon from '@icon/system/fill/calendar-blank-fill.svg';
import ChatsCircleFillIcon from '@icon/system/fill/chats-circle-fill.svg';
import EmailFillIcon from '@icon/system/fill/envelope-fill.svg';
import FolderSimpleFillIcon from '@icon/system/fill/folder-simple-fill.svg';
import GitPullRequestFillIcon from '@icon/system/fill/git-pull-request-fill.svg';
import ListChecksFillIcon from '@icon/system/fill/list-checks-fill.svg';
import PhoneCallFillIcon from '@icon/system/fill/phone-call-fill.svg';
import AgentFillIcon from '@icon/system/fill/sparkle-fill.svg';
import BellIcon from '@icon/system/regular/bell.svg';
import BuildingsIcon from '@icon/system/regular/buildings.svg';
import CalendarBlankIcon from '@icon/system/regular/calendar-blank.svg';
import CalendarCheckIcon from '@icon/system/regular/calendar-check.svg';
import ChatsCircleIcon from '@icon/system/regular/chats-circle.svg';
import FolderSimpleIcon from '@icon/system/regular/folder-simple.svg';
import GitPullRequestIcon from '@icon/system/regular/git-pull-request.svg';
import PlugIcon from '@icon/system/regular/plug.svg';
import PlugFillIcon from '@phosphor-fill/plug-fill.svg';
import { createMemo } from 'solid-js';
import type { MobileDockIcon } from './MobileDockButton';
import type { MobileNavViewId } from './mobile-nav-views';

export type MobileDockView = {
  id: Exclude<MobileNavViewId, 'search' | 'settings'>;
  label: string;
  /** Phosphor glyph for this view. */
  icon: MobileDockIcon;
  iconActive?: MobileDockIcon;
};

/**
 * Dock navigation order. Views that do not fit go in More; Settings is
 * added by its own surface.
 */
export const MOBILE_DOCK_VIEWS: readonly MobileDockView[] = [
  {
    id: 'home',
    label: 'Notifications',
    icon: BellIcon,
    iconActive: BellFillIcon,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: CalendarBlankIcon,
    iconActive: CalendarBlankFillIcon,
  },
  {
    id: 'mail',
    label: 'Email',
    icon: getIconConfig('email').icon,
    iconActive: EmailFillIcon,
  },
  {
    id: 'channels',
    label: 'Chat',
    icon: ChatsCircleIcon,
    iconActive: ChatsCircleFillIcon,
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: getIconConfig('agent').icon,
    iconActive: AgentFillIcon,
  },
  {
    id: 'documents',
    label: 'Files',
    icon: FolderSimpleIcon,
    iconActive: FolderSimpleFillIcon,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: getIconConfig('task').icon,
    iconActive: ListChecksFillIcon,
  },
  {
    id: 'calls',
    label: 'Calls',
    icon: getIconConfig('call').icon,
    iconActive: PhoneCallFillIcon,
  },
  {
    id: 'companies',
    label: 'Customers',
    icon: BuildingsIcon,
    iconActive: BuildingsFillIcon,
  },
  {
    id: 'reviews',
    label: 'Reviews',
    icon: GitPullRequestIcon,
    iconActive: GitPullRequestFillIcon,
  },
  { id: 'booking-links', label: 'Scheduling', icon: CalendarCheckIcon },
  {
    id: 'external',
    label: 'External',
    icon: PlugIcon,
    iconActive: PlugFillIcon,
  },
];

export function useMobileDockViews() {
  const calendarEnabled = useCalendarUiFlag();
  const crm = useFeatureFlag(enableCrm);
  const reviews = useFeatureFlag(enableTasksReviews);
  const scheduling = useFeatureFlag(enableCalendarScheduling);
  const external = useFeatureFlag(enableWhatsappLinked);
  return createMemo(() =>
    MOBILE_DOCK_VIEWS.filter(
      (view) => view.id !== 'calendar' || calendarEnabled()
    )
      .filter((view) => view.id !== 'companies' || crm().enabled)
      .filter((view) => view.id !== 'reviews' || reviews().enabled)
      .filter((view) => view.id !== 'booking-links' || scheduling().enabled)
      .filter((view) => view.id !== 'external' || external().enabled)
  );
}
