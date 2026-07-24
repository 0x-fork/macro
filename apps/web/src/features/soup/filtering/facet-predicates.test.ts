import type { EntityData } from '@entity';
import type { NotificationSource } from '@notifications';
import { describe, expect, it, vi } from 'vitest';
import { notDoneFilter, unreadFilter } from './facet-predicates';

vi.mock('@entity', () => ({
  getCompanyOwnerId: vi.fn(),
  getCompanyStageOptionId: vi.fn(),
  getTaskAssigneeIds: vi.fn(),
  getTaskStatusOptionId: vi.fn(),
  isGithubPrEntity: vi.fn(),
  isTaskEntity: vi.fn(),
  toNotificationEntity: (entity: EntityData) => entity,
}));
vi.mock('@entity/utils/task-properties', () => ({
  getTaskPriorityOptionId: vi.fn(),
}));
vi.mock('@notifications', () => ({
  compositeEntity: (entity: EntityData) => entity.id,
}));

const notificationSource = {
  notificationsByEntity: () => ({}),
} as unknown as NotificationSource;

describe('notification facet predicates', () => {
  it('accepts notifications attached as accessors', () => {
    const entity = {
      id: 'document-1',
      type: 'document',
      notifications: () => [
        {
          id: 'notification-1',
          viewed_at: null,
          done: false,
        },
      ],
    } as unknown as EntityData;

    expect(unreadFilter(notificationSource)(entity)).toBe(true);
    expect(notDoneFilter(notificationSource)(entity)).toBe(true);
  });

  it('accepts notifications attached as raw arrays', () => {
    const entity = {
      id: 'document-1',
      type: 'document',
      notifications: [
        {
          id: 'notification-1',
          viewed_at: null,
          done: false,
        },
      ],
    } as unknown as EntityData;

    expect(unreadFilter(notificationSource)(entity)).toBe(true);
    expect(notDoneFilter(notificationSource)(entity)).toBe(true);
  });
});
