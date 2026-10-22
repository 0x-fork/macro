import { match } from 'ts-pattern';
import type { ImportCategoryConfig, ImportProvider } from './providers';

/** What the agent chat that runs an import opens with. */
export type AgentImportHandoff = {
  /** Unsent composer text the user can adjust before sending. */
  input: string;
  /** Private guidance for the agent; never shown in the transcript. */
  instructions: string;
};

function createWith(
  config: ImportCategoryConfig,
  provider: ImportProvider
): string {
  // Macro's Notion importer converts and dedupes pages itself.
  if (provider.ledger === 'notion')
    return 'Import each chosen page with ImportNotionPage; never recreate a page with CreateDocument.';
  return match(config.category)
    .with(
      'files',
      () =>
        'Create each document with CreateDocument, converting its content to markdown. Keep the original title.'
    )
    .with(
      'tasks',
      () =>
        'Create each one with CreateDocument and isTask true. Keep the title, put the description in the body, and set status, assignee, and due date with SetEntityProperty when the source has them.'
    )
    .with(
      'crm',
      () =>
        'Check ListCompanies first so nothing is duplicated, then use CreateCompany and CreateContact. Set stage, owner, and other properties with SetEntityProperty when the source has them.'
    )
    .with(
      'channels',
      () =>
        'Create each channel with CreateChannel, keeping its name and purpose.'
    )
    .exhaustive();
}

/** Ledger bookkeeping, so neither the user nor a teammate imports twice. */
function ledgerSteps(provider: ImportProvider): string[] {
  if (!provider.ledger || provider.ledger === 'notion') return [];
  return [
    `Check ListImportEntities for source ${provider.ledger} first and leave out anything already imported or declined.`,
    `After creating each item, record it with CreateImportEntity: source ${provider.ledger}, status imported, and the new entityId.`,
  ];
}

export function agentImportHandoff(
  config: ImportCategoryConfig,
  provider: ImportProvider
): AgentImportHandoff {
  return {
    input: `Import my most recent ${config.items} from ${provider.name} into ${config.destination}.`,
    instructions: [
      `The user started this from Macro's import dialog and has just connected ${provider.name}.`,
      `Use the ${provider.name} connector tools to find their most relevant recent ${config.items}.`,
      ...ledgerSteps(provider),
      `Before creating anything, show a short numbered list and ask which ones to bring over.`,
      createWith(config, provider),
      `Only read from ${provider.name}; never edit or delete anything there.`,
      'Finish with links to everything you created.',
    ].join(' '),
  };
}
