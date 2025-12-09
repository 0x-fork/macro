import { UnifiedListItemCheckbox } from './unified-list-item-checkbox';
import { UnifiedListItemContent } from './unified-list-item-content';
import { UnifiedListItemMainContent } from './unified-list-item-main-content';
import { UnifiedListItemRightContent } from './unified-list-item-right-content';
import { UnifiedListItemRoot } from './unified-list-item-root';

type UnifiedListItemType = typeof UnifiedListItemRoot & {
  Content: typeof UnifiedListItemContent;
  Checkbox: typeof UnifiedListItemCheckbox;
  MainContent: typeof UnifiedListItemMainContent;
  RightContent: typeof UnifiedListItemRightContent;
};
export const UnifiedListItem: UnifiedListItemType = Object.assign(
  UnifiedListItemRoot,
  {
    Content: UnifiedListItemContent,
    Checkbox: UnifiedListItemCheckbox,
    MainContent: UnifiedListItemMainContent,
    RightContent: UnifiedListItemRightContent,
  }
);
