import { openChatWithInput } from '@app/component/ChatWithAgentButton';
import { SidePanel, useSidePanel } from '@app/component/side-panel';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import { StaticSplitLabel } from '@app/component/split-layout/components/SplitLabel';
import MacroLogo from '@icon/macro-logo.svg';
import { AnimatedContactIcon } from '@icon/wide-contact';
import SidePanelIcon from '@phosphor/square-half.svg';
import { useContactQuery } from '@queries/crm/contacts';
import { useIsTeamAdmin } from '@queries/team/teams';
import { Button, cn } from '@ui';
import { Show } from 'solid-js';
import { ContactDiscussionSection } from './ContactDiscussionSection';
import { ContactEmailsSection } from './ContactEmailsSection';
import { ContactHeader } from './ContactHeader';
import { ContactMetadataSection } from './ContactMetadataSection';
import { ContactSharingSection } from './ContactSharingSection';

function ContactActionsBar(props: { contactName: string }) {
  return (
    <div class="mb-2 flex items-center gap-1.5">
      <Button
        variant="base"
        depth={1}
        size="sm"
        noTouchResize
        class="ask-macro-button group h-6 rounded-full border-transparent bg-ink/3 px-2 py-0 text-xs font-medium gap-1.5 text-ink/65 hover:bg-ink/6 hover:text-ink"
        onClick={() =>
          void openChatWithInput(`Tell me about ${props.contactName}`)
        }
      >
        <MacroLogo class="ask-macro-logo-shimmer size-3.5 shrink-0" />
        <span>Ask Macro</span>
      </Button>
    </div>
  );
}

function ContactHeaderDetailsButton() {
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
 * Root of the contact detail view. Owns the contact query and pushes the
 * resolved entity down to presentational children. Layout mirrors the
 * company block: middle content constrained to a centered column,
 * additional info in the right-hand SidePanel.
 */
export function Contact(props: { contactId: string }) {
  const contactQuery = useContactQuery(() => props.contactId);
  const contact = () => contactQuery.data;
  const isTeamAdmin = useIsTeamAdmin();
  const contactName = () => contact()?.name ?? contact()?.email ?? 'Contact';

  return (
    <SidePanel.Layout>
      <SplitHeaderLeft>
        <StaticSplitLabel
          label={contactName()}
          icon={<AnimatedContactIcon class="size-4 text-ink-extra-muted" />}
        />
      </SplitHeaderLeft>
      <ContactHeaderDetailsButton />
      <div class="flex h-full flex-col overflow-y-auto scrollbar-hidden">
        <div class="mx-auto flex w-full max-w-3xl min-w-0 grow flex-col gap-6 px-6 pt-12 pb-12">
          <ContactActionsBar contactName={contactName()} />
          <ContactHeader contact={contact()} />
          <ContactDiscussionSection contactId={props.contactId} />
          <ContactEmailsSection contact={contact()} />
        </div>
      </div>

      <SidePanel.Section
        id="contact-details"
        title="Details"
        order={10}
        defaultOpen
      >
        <ContactMetadataSection contact={contact()} />
      </SidePanel.Section>
      {/* Sharing is admin-only; hide the whole section for non-admins
          rather than rendering it empty. */}
      <Show when={isTeamAdmin()}>
        <SidePanel.Section id="contact-sharing" title="Sharing" order={25}>
          <ContactSharingSection contact={contact()} />
        </SidePanel.Section>
      </Show>
      {/* TODO: add a References section (inbound channel messages + documents)
          once the references backend supports the crm_contact entity type. */}
    </SidePanel.Layout>
  );
}
