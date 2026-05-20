import type { BlockAlias, BlockName } from '@core/block';
import { fileTypeToBlockName } from '@core/constant/allBlocks';
import type { EntityItem } from '@core/context/quickAccess';
import { match } from 'ts-pattern';
import type { MentionItem } from '../../../../utils/mentionsUtils';

/**
 * Get the block name from an entity item for use in mentions.
 */
export function getBlockNameFromEntity(
  item: EntityItem
): BlockName | BlockAlias {
  return match(item.bucket)
    .with('channel', () => 'channel' as const)
    .with('dm', () => 'channel' as const)
    .with('email', () => 'email' as const)
    .with('chat', () => 'chat' as const)
    .with('project', () => 'project' as const)
    .with('task', () => 'task' as const)
    .with('note', () => 'md' as const)
    .otherwise(() => {
      const entity = item.data;
      if ('fileType' in entity && typeof entity.fileType === 'string') {
        return fileTypeToBlockName(entity.fileType);
      }
      return 'unknown';
    });
}

/**
 * Get display name for a MentionItem.
 */
export function getMentionItemName(item: MentionItem): string {
  return match(item)
    .with({ kind: 'user' }, (i) => {
      const { email, name } = i.data;
      if (name === email) return email;
      return `${name} | ${email}`;
    })
    .with({ kind: 'group' }, (i) => `@${i.data.groupAlias}`)
    .with({ kind: 'date' }, (i) => i.data.displayText)
    .with(
      { kind: 'entity' },
      (i) => i.data.name ?? (i.bucket === 'email' ? 'No Subject' : '')
    )
    .exhaustive();
}
