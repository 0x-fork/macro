import { InlineCheckbox } from '@channel/Call/CallControls/CallMenuPrimitives';
import { toast } from '@core/component/Toast/Toast';
import { useIsTeamAdmin } from '@queries/team/teams';
import type { CrmContactResponse } from '@service-storage/generated/schemas/crmContactResponse';
import { cn } from '@ui';
import { Show } from 'solid-js';
import { useSetContactHiddenMutation } from './use-set-contact-hidden-mutation';

const TOGGLE_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-md h-7 px-2.5 text-xs select-none w-fit border border-ink-muted/[0.08] bg-ink-muted/[0.025] text-ink hover:bg-ink-muted/[0.06]';

export function ContactSharingSection(props: { contact?: CrmContactResponse }) {
  const isTeamAdmin = useIsTeamAdmin();
  const hiddenMutation = useSetContactHiddenMutation();

  const handleToggle = async (
    contact: CrmContactResponse,
    nextShared: boolean
  ) => {
    const willHide = !nextShared;
    try {
      await hiddenMutation.mutateAsync({
        contactId: contact.id,
        hidden: willHide,
      });
      if (willHide) {
        toast.success('Contact hidden.');
      }
    } catch (error) {
      console.error('failed to update contact sharing', error);
    }
  };

  return (
    <Show
      when={props.contact}
      fallback={<div class="text-xs text-ink-muted">Loading…</div>}
    >
      {(contact) => {
        const isShared = () => !contact().hidden;
        return (
          <div class="flex flex-col gap-4 text-xs">
            <Show when={isTeamAdmin()}>
              <div class="flex flex-col gap-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isShared()}
                  disabled={hiddenMutation.isPending}
                  onClick={() => void handleToggle(contact(), !isShared())}
                  class={cn(TOGGLE_BUTTON_CLASS)}
                >
                  <InlineCheckbox checked={isShared()} />
                  <span class="whitespace-nowrap">Visible in CRM</span>
                </button>
                <p class="text-ink-muted leading-5">
                  Shows this contact in their company's contact list. Hide
                  contacts that aren't relevant to your team's CRM.
                </p>
              </div>
            </Show>
          </div>
        );
      }}
    </Show>
  );
}
