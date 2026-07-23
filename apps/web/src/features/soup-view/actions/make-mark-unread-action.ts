import {
  makeMarkReadAction as makeNextSoupMarkReadAction,
  makeMarkUnreadAction as makeNextSoupMarkUnreadAction,
} from '@app/features/next-soup/actions';
import type { EntityData } from '@entity';
import type { SoupActionListState } from './list-action-state';

const withListExecution = (action: {
  canExecute: (entity: EntityData) => boolean;
  execute: (entities: EntityData[]) => Promise<void>;
}) => ({
  ...action,
  executeWithList: async (
    entities: EntityData[],
    _list: SoupActionListState
  ): Promise<void> => {
    await action.execute(entities);
  },
});

export const makeMarkUnreadAction = () =>
  withListExecution(makeNextSoupMarkUnreadAction());

export const makeMarkReadAction = () =>
  withListExecution(makeNextSoupMarkReadAction());
