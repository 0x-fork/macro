import { refetchDocumentShareButtonResource } from '@core/component/TopBar/ShareButton';
import { invalidateUserQuota } from '@queries/auth';
import { refetchHistory } from '@queries/history/history';
import { invalidatePreview } from '@queries/preview';
import { invalidateDeletedItems } from '@queries/storage/deleted';
import { invalidateProjects } from '@queries/storage/projects';

export function refetchResources() {
  // TODO: fetch documents
  // refetchDocuments();
  void invalidateUserQuota();
  void refetchHistory();
  void refetchProjectResources();
  void invalidateDeletedItems();
  void invalidatePreview();
}

async function refetchProjectResources(_force = false) {
  await invalidateProjects();

  refetchDocumentShareButtonResource();
}
