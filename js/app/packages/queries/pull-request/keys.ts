const root = ['pull-request'] as const;
const entity = [...root, 'entity'] as const;

export const pullRequestKeys = {
  _def: root,
  entity: Object.assign(
    (id: string) => ({
      queryKey: [...entity, id] as const,
    }),
    { _def: entity }
  ),
} as const;
