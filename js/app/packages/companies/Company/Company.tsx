import { openChatWithInput } from '@app/component/ChatWithAgentButton';
import { SidePanel, useSidePanel } from '@app/component/side-panel';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import { StaticSplitLabel } from '@app/component/split-layout/components/SplitLabel';
import MacroLogo from '@icon/macro-logo.svg';
import SidePanelIcon from '@phosphor/square-half.svg';
import { useCompanyQuery } from '@queries/crm/companies';
import { Button, cn } from '@ui';
import { Show } from 'solid-js';
import { CompanyContactsSection } from './CompanyContactsSection';
import { CompanyDiscussionSection } from './CompanyDiscussionSection';
import { CompanyEmailsSection } from './CompanyEmailsSection';
import { CompanyHeader } from './CompanyHeader';
import { CompanyMetadataSection } from './CompanyMetadataSection';
import { CompanySharingSection } from './CompanySharingSection';

function CompanyActionsBar(props: { companyName: string }) {
  return (
    <div class="mb-2 flex items-center gap-1.5">
      <Button
        variant="base"
        depth={1}
        size="sm"
        noTouchResize
        class="ask-macro-button group h-6 rounded-full border-transparent bg-ink/3 px-2 py-0 text-xs font-medium gap-1.5 text-ink/65 hover:bg-ink/6 hover:text-ink"
        onClick={() =>
          void openChatWithInput(`Tell me about ${props.companyName}`)
        }
      >
        <MacroLogo class="ask-macro-logo-shimmer size-3.5 shrink-0" />
        <span>Ask Macro</span>
      </Button>
    </div>
  );
}

function CompanyHeaderDetailsButton() {
  const sidePanel = useSidePanel();
  return (
    <SplitHeaderRight>
      <Show when={sidePanel && sidePanel.hasSections() ? sidePanel : undefined}>
        {(panel) => (
          <Button
            depth={2}
            variant="base"
            size="icon-sm"
            class={cn('ml-1.5 size-6 p-1 bg-surface [&_svg]:size-3.5', {
              'bg-active text-ink': panel().isOpen(),
            })}
            tooltip="View details"
            onClick={() => panel().toggle()}
          >
            <SidePanelIcon />
          </Button>
        )}
      </Show>
    </SplitHeaderRight>
  );
}

/**
 * Root of the company detail view. Owns the company query and pushes the
 * resolved entity down to presentational children. Layout mirrors the task
 * page: middle content constrained to a centered column, additional info in
 * the right-hand SidePanel.
 */
export function Company(props: { companyId: string }) {
  const { company, contacts } = useCompanyQuery(() => props.companyId);
  const companyName = () => company()?.name || 'Company';

  return (
    <SidePanel.Layout>
      <SplitHeaderLeft>
        <StaticSplitLabel label={companyName()} iconType="crm_company" />
      </SplitHeaderLeft>
      <CompanyHeaderDetailsButton />
      <div class="flex h-full flex-col overflow-y-auto scrollbar-hidden">
        <div class="mx-auto flex w-full max-w-3xl min-w-0 grow flex-col gap-6 px-6 pt-12 pb-12">
          <CompanyActionsBar companyName={companyName()} />
          <CompanyHeader company={company()} />
          <CompanyDiscussionSection companyId={props.companyId} />
          <CompanyEmailsSection company={company()} />
        </div>
      </div>

      <SidePanel.Section
        id="company-details"
        title="Details"
        order={10}
        defaultOpen
      >
        <CompanyMetadataSection company={company()} />
      </SidePanel.Section>
      <SidePanel.Section
        id="company-contacts"
        title="Contacts"
        order={20}
        defaultOpen
      >
        <CompanyContactsSection company={company()} contacts={contacts()} />
      </SidePanel.Section>
      <SidePanel.Section id="company-sharing" title="Sharing" order={25}>
        <CompanySharingSection company={company()} />
      </SidePanel.Section>
      {/* TODO: add a References section (inbound channel messages + documents)
          once the references backend supports the crm_company entity type. */}
    </SidePanel.Layout>
  );
}
