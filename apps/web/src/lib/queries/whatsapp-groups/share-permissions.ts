import type { UpdateSharePermissionRequestV2 } from '@service-storage/generated/schemas/updateSharePermissionRequestV2';
import { whatsappGroupsClient } from '@service-storage/whatsapp-groups';
import { invalidateWhatsappGroup } from './index';

export function fetchWhatsappGroupPermissions(groupId: string) {
  return whatsappGroupsClient.permissions(groupId);
}
export async function updateWhatsappGroupPermissions(
  groupId: string,
  request: UpdateSharePermissionRequestV2
) {
  const result = await whatsappGroupsClient.updatePermissions(groupId, request);
  if (result.isOk()) invalidateWhatsappGroup(groupId);
  return result;
}
