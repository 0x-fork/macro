import { AccessLevel as UserAccessLevel } from '@service-storage/generated/schemas/accessLevel';
import { match } from 'ts-pattern';

export enum Permissions {
  OWNER = 'Owner',
  CAN_EDIT = 'Can Edit',
  CAN_VIEW = 'Can View',
  CAN_COMMENT = 'Can Comment',
  NO_ACCESS = 'No Access',
}
export const getPermissions = (accessLevel?: UserAccessLevel) => {
  if (!accessLevel) return Permissions.NO_ACCESS;
  return match(accessLevel)
    .with('owner', () => Permissions.OWNER)
    .with('edit', () => Permissions.CAN_EDIT)
    .with('comment', () => Permissions.CAN_COMMENT)
    .with('view', () => Permissions.CAN_VIEW)
    .otherwise(() => Permissions.NO_ACCESS);
};

export const comparePermissions = (a: Permissions, b: Permissions) => {
  const priorityMap: { [key in Permissions]: number } = {
    [Permissions.OWNER]: 5,
    [Permissions.CAN_EDIT]: 4,
    [Permissions.CAN_COMMENT]: 3,
    [Permissions.CAN_VIEW]: 2,
    [Permissions.NO_ACCESS]: 1,
  };

  return priorityMap[a] - priorityMap[b];
};

export const getAccessLevel = (
  permissions?: Permissions
): UserAccessLevel | null => {
  return match(permissions)
    .with(Permissions.OWNER, () => UserAccessLevel.owner)
    .with(Permissions.CAN_EDIT, () => UserAccessLevel.edit)
    .with(Permissions.CAN_COMMENT, () => UserAccessLevel.comment)
    .with(Permissions.CAN_VIEW, () => UserAccessLevel.view)
    .otherwise(() => null);
};

export const hasPermissions = (
  permissions: Permissions,
  requestedPermissions: Permissions
) => {
  return comparePermissions(permissions, requestedPermissions) >= 0;
};
