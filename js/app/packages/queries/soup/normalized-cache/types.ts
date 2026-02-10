export interface SoupTrasaction {
  rollback(): void;
}

export type SoupEntityTag =
  | 'document'
  | 'chat'
  | 'channel'
  | 'project'
  | 'emailThread';
