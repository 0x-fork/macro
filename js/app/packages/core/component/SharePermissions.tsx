import type { AccessLevel as UserAccessLevel } from '@service-storage/generated/schemas/accessLevel';

export enum Permissions {
  OWNER = 'Owner',
  CAN_EDIT = 'Can Edit',
  CAN_VIEW = 'Can View',
  CAN_COMMENT = 'Can Comment',
  NO_ACCESS = 'No Access',
}
export const getPermissions = (accessLevel?: UserAccessLevel) => {
  if (!accessLevel) return Permissions.NO_ACCESS;
  switch (accessLevel) {
    case 'owner':
      return Permissions.OWNER;
    case 'edit':
      return Permissions.CAN_EDIT;
    case 'comment':
      return Permissions.CAN_COMMENT;
    case 'view':
      return Permissions.CAN_VIEW;
    default:
  }
  return Permissions.NO_ACCESS;
};

const comparePermissions = (a: Permissions, b: Permissions) => {
  const priorityMap: { [key in Permissions]: number } = {
    [Permissions.OWNER]: 5,
    [Permissions.CAN_EDIT]: 4,
    [Permissions.CAN_COMMENT]: 3,
    [Permissions.CAN_VIEW]: 2,
    [Permissions.NO_ACCESS]: 1,
  };

  return priorityMap[a] - priorityMap[b];
};

export const hasPermissions = (
  permissions: Permissions,
  requestedPermissions: Permissions
) => {
  return comparePermissions(permissions, requestedPermissions) >= 0;
};
