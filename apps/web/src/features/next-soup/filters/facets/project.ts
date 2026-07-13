import { facet } from './base';

// Scopes a soup view to a single project across documents, chats, folders, and
// emails (the project block's entity list). `restrict` NIL-fills the entity
// types the block never shows (channels, calls, crm, foreign), matching the
// query-filter seed this replaced. Open id space: the id is the project id.
export const PROJECT_SCOPE = facet({
  id: 'project-scope',
  mode: 'or',
  restrict: true,
  options: (projectId) => ({
    id: projectId,
    clause: (b) => ({
      df: b.eq('documentProjectId', projectId),
      cf: b.eq('chatProjectId', projectId),
      pf: b.eq('folderId', projectId),
      ef: b.eq('emailProjectId', projectId),
    }),
  }),
});
